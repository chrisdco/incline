/**
 * A finished workout's changes flowing back to its routine, and the
 * routine's version history (docs/decisions/ROUTINE-CHANGES.md). What counts
 * as a change lives in src/contracts/templates/session-changes.ts; this
 * module only reads and writes.
 */
import type { NextRoutineRow, RoutineSlot } from '@/contracts/templates/session-changes';
import { newUuid } from '@/lib/uuid';

import { openDatabase } from '../client';
import { mutate, type DbTable, type Tx } from '../write';
import type { TemplateExerciseRow } from './helpers';
import { enqueueLogUpsert } from './sessions';
import {
  enqueueTemplateExerciseUpsert,
  enqueueTemplateUpsert,
  insertTemplateCopy,
  snapshotTemplate,
  TEMPLATE_TABLES,
  writeTemplateState,
  type TemplateStateRow,
} from './templates';

/** Versions kept per routine; the oldest go first. */
export const MAX_TEMPLATE_VERSIONS = 20;

const VERSION_TABLES: readonly DbTable[] = [...TEMPLATE_TABLES, 'template_versions'];

/** Why a version was saved: the write that came right after it. */
export type VersionReason = 'workout-update' | 'workout-rest' | 'restore';

export const VERSION_REASON_LABELS: Record<VersionReason, string> = {
  'workout-update': 'Before a workout updated it',
  'workout-rest': 'Before a workout changed rest times',
  restore: 'Before restoring an older version',
};

/** Saves the routine as it is now; null when the routine is gone. */
export async function saveTemplateVersion(tx: Tx, templateId: number, reason: VersionReason): Promise<number | null> {
  const snap = await snapshotTemplate(tx, templateId);
  if (!snap) return null;
  const res = await tx.runAsync(
    'INSERT INTO template_versions (template_id, name, rows_json, reason, created_at) VALUES (?, ?, ?, ?, ?)',
    templateId, snap.name, JSON.stringify(snap.rows), reason, Date.now(),
  );
  await tx.runAsync(
    `DELETE FROM template_versions WHERE template_id = ? AND id NOT IN (
       SELECT id FROM template_versions WHERE template_id = ? ORDER BY created_at DESC, id DESC LIMIT ?)`,
    templateId, templateId, MAX_TEMPLATE_VERSIONS,
  );
  return res.lastInsertRowId;
}

export interface RoutineForSession {
  templateId: number;
  name: string;
  estimatedMinutes: number;
  slots: RoutineSlot[];
}

/** The routine a workout compares against at finish; null when it's gone. */
export async function getRoutineForSession(templateId: number): Promise<RoutineForSession | null> {
  const db = await openDatabase();
  const t = await db.getFirstAsync<{ name: string; estimated_minutes: number }>(
    'SELECT name, estimated_minutes FROM workout_templates WHERE id = ? AND deleted_at IS NULL',
    templateId,
  );
  if (!t) return null;
  const rows = await db.getAllAsync<{ exercise_id: number; name: string; target_sets: number; rest_seconds: number }>(
    `SELECT te.exercise_id, e.name, te.target_sets, te.rest_seconds
     FROM template_exercises te JOIN exercises e ON e.id = te.exercise_id
     WHERE te.template_id = ? AND te.deleted_at IS NULL
     ORDER BY te.sort_order, te.id`,
    templateId,
  );
  return {
    templateId,
    name: t.name,
    estimatedMinutes: t.estimated_minutes,
    slots: rows.map((r) => ({ exerciseId: r.exercise_id, name: r.name, sets: r.target_sets, restSeconds: r.rest_seconds })),
  };
}

/**
 * Next rows → whole-routine write rows. Kept exercises keep their row (and
 * so their rep range, notes and superset); a routine listing the same
 * exercise twice keeps the second copy right after the first.
 */
function toStateRows(next: readonly NextRoutineRow[], current: readonly TemplateExerciseRow[]): TemplateStateRow[] {
  const queues = new Map<number, TemplateExerciseRow[]>();
  for (const row of current) queues.set(row.exercise_id, [...(queues.get(row.exercise_id) ?? []), row]);
  const out: TemplateStateRow[] = [];
  for (const r of next) {
    const queue = queues.get(r.exerciseId) ?? [];
    const cur = queue.shift();
    out.push({
      id: cur?.id,
      exerciseId: r.exerciseId,
      sets: r.sets,
      repsMin: cur?.target_reps_min ?? r.repsMin ?? 8,
      repsMax: cur?.target_reps_max ?? r.repsMax ?? 12,
      restSeconds: r.restSeconds,
    });
    for (const dup of queue) {
      out.push({ id: dup.id, exerciseId: dup.exercise_id, sets: dup.target_sets, repsMin: dup.target_reps_min, repsMax: dup.target_reps_max });
    }
    queues.delete(r.exerciseId);
  }
  return out;
}

export interface AppliedRoutine {
  templateId: number;
  name: string;
  /** The version saved before the write (update only); Undo restores it. */
  versionId: number | null;
}

/** Writes the workout's shape into its routine. The old shape is saved as a version first. */
export async function updateRoutineFromWorkout(
  templateId: number,
  next: readonly NextRoutineRow[],
  reason: Extract<VersionReason, 'workout-update' | 'workout-rest'>,
): Promise<AppliedRoutine | null> {
  return mutate(VERSION_TABLES, async (tx) => {
    const before = await snapshotTemplate(tx, templateId);
    if (!before) return null;
    const versionId = await saveTemplateVersion(tx, templateId, reason);
    await writeTemplateState(tx, templateId, before.name, toStateRows(next, before.rows), before.rows);
    return { templateId, name: before.name, versionId };
  });
}

/** "Routine · 19 Nov": a dated copy, so the user can tell it from the original. */
export function copyRoutineName(name: string, at: Date = new Date()): string {
  const day = at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${name} · ${day}`.slice(0, 60);
}

/**
 * Saves the workout's shape as a new routine; the original is untouched.
 * The finished log moves to the copy, so the copy's next run compares
 * against it (ghost, last time, progression).
 */
export async function saveWorkoutAsRoutineCopy(
  logId: number,
  sourceId: number,
  next: readonly NextRoutineRow[],
  estimatedMinutes: number,
): Promise<AppliedRoutine | null> {
  return mutate([...VERSION_TABLES, 'workout_logs'], async (tx) => {
    const source = await snapshotTemplate(tx, sourceId);
    if (!source) return null;
    const name = copyRoutineName(source.name);
    const copyId = await insertTemplateCopy(tx, sourceId, name, toStateRows(next, source.rows), estimatedMinutes);
    if (copyId == null) return null;
    await tx.runAsync('UPDATE workout_logs SET template_id = ?, updated_at = ? WHERE id = ?', copyId, Date.now(), logId);
    await enqueueLogUpsert(tx, logId);
    return { templateId: copyId, name, versionId: null };
  });
}

export interface TemplateVersion {
  id: number;
  templateId: number;
  name: string;
  reason: VersionReason;
  createdAt: number;
  exercises: { name: string; sets: number }[];
}

export async function listTemplateVersions(templateId: number): Promise<TemplateVersion[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<{ id: number; name: string; reason: string; rows_json: string; created_at: number }>(
    'SELECT id, name, reason, rows_json, created_at FROM template_versions WHERE template_id = ? ORDER BY created_at DESC, id DESC',
    templateId,
  );
  const parsed = rows.map((r) => ({ ...r, snap: parseRows(r.rows_json) }));
  const ids = [...new Set(parsed.flatMap((r) => r.snap.map((x) => x.exercise_id)))];
  const names = new Map<number, string>();
  if (ids.length > 0) {
    const found = await db.getAllAsync<{ id: number; name: string }>(
      `SELECT id, name FROM exercises WHERE id IN (${ids.map(() => '?').join(',')})`,
      ...ids,
    );
    for (const e of found) names.set(e.id, e.name);
  }
  return parsed.map((r) => ({
    id: r.id,
    templateId,
    name: r.name,
    reason: (r.reason in VERSION_REASON_LABELS ? r.reason : 'workout-update') as VersionReason,
    createdAt: r.created_at,
    exercises: r.snap.map((x) => ({ name: names.get(x.exercise_id) ?? 'Exercise', sets: x.target_sets })),
  }));
}

function parseRows(json: string): TemplateExerciseRow[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as TemplateExerciseRow[]) : [];
  } catch {
    return [];
  }
}

/**
 * Puts a routine back to a saved version. The current state is saved as a
 * version first, so a restore can itself be undone. Rows are only ever
 * soft-deleted, so the version's rows come back with their ids and uuids;
 * one that no longer exists locally is inserted fresh.
 */
export async function restoreTemplateVersion(versionId: number): Promise<boolean> {
  return mutate(VERSION_TABLES, async (tx) => {
    const v = await tx.getFirstAsync<{ template_id: number; name: string; rows_json: string }>(
      'SELECT template_id, name, rows_json FROM template_versions WHERE id = ?',
      versionId,
    );
    if (!v) return false;
    const templateId = v.template_id;
    const current = await snapshotTemplate(tx, templateId);
    if (!current) return false;
    await saveTemplateVersion(tx, templateId, 'restore');
    const target = parseRows(v.rows_json);
    const keep = new Set(target.map((r) => r.id));
    const now = Date.now();
    for (const row of current.rows) {
      if (keep.has(row.id)) continue;
      await tx.runAsync('UPDATE template_exercises SET deleted_at = ?, updated_at = ? WHERE id = ?', now, now, row.id);
      await enqueueTemplateExerciseUpsert(tx, row.id);
    }
    for (const row of target) {
      const res = await tx.runAsync(
        `UPDATE template_exercises SET exercise_id = ?, sort_order = ?, target_sets = ?, target_reps_min = ?,
         target_reps_max = ?, rest_seconds = ?, notes = ?, superset_group = ?, deleted_at = NULL, updated_at = ?
         WHERE id = ? AND template_id = ?`,
        row.exercise_id, row.sort_order, row.target_sets, row.target_reps_min, row.target_reps_max,
        row.rest_seconds, row.notes ?? '', row.superset_group ?? null, now, row.id, templateId,
      );
      let id = row.id;
      if (res.changes === 0) {
        const ins = await tx.runAsync(
          `INSERT INTO template_exercises (template_id, exercise_id, sort_order, target_sets, target_reps_min, target_reps_max, rest_seconds, notes, superset_group, uuid, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          templateId, row.exercise_id, row.sort_order, row.target_sets, row.target_reps_min, row.target_reps_max,
          row.rest_seconds, row.notes ?? '', row.superset_group ?? null, newUuid(), now,
        );
        id = ins.lastInsertRowId;
      }
      await enqueueTemplateExerciseUpsert(tx, id);
    }
    await tx.runAsync('UPDATE workout_templates SET name = ?, updated_at = ? WHERE id = ?', v.name, now, templateId);
    await enqueueTemplateUpsert(tx, templateId);
    return true;
  });
}
