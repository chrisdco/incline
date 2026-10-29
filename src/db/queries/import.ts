/**
 * Write a planned Strong / Hevy import (src/lib/import/plan.ts) into SQLite.
 *
 * ONE mutate(): custom exercises, finished workout logs, their sets and
 * every outbox enqueue commit together or not at all, and the table-change
 * event after COMMIT invalidates history/progress/catalog queries. The
 * dedupe check runs inside the same transaction so two quick taps can't
 * double-import. Reads are batched (one range query for existing logs, one
 * IN-query per 500 sets for the outbox payloads); the per-row statements
 * are inserts only.
 */

import { buildSearchText } from '@/lib/exercise-search';
import { filterExisting, type PlannedWorkout } from '@/lib/import/plan';
import { normaliseName, type MatchEquipment } from '@/lib/import/match';
import { newUuid } from '@/lib/uuid';
import { enqueueSync } from '@/sync/outbox';

import { mutate, type Tx } from '../write';
import { enqueueSetUpserts } from './sessions';

export interface ImportResolution {
  /** importName → catalog exercise id, or null to create a custom exercise. */
  exerciseIds: Map<string, number | null>;
  /** importName → equipment guess for new custom exercises. */
  equipment: Map<string, MatchEquipment>;
}

export interface ImportOutcome {
  importedWorkouts: number;
  importedSets: number;
  skippedExisting: number;
  createdExercises: number;
}

const ENQUEUE_CHUNK = 500;

async function createCustom(tx: Tx, name: string, equipment: MatchEquipment, now: number): Promise<number> {
  const uuid = newUuid();
  const primaryMuscle = 'full_body';
  const category = 'strength';
  const res = await tx.runAsync(
    `INSERT INTO exercises (name, primary_muscle, movement_pattern, equipment, category, is_compound, is_custom, source, tips, search_text, uuid, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, 0, 1, 'custom', '', ?, ?, ?, ?)`,
    name, primaryMuscle, equipment, category,
    buildSearchText({ name, primaryMuscle, equipment, pattern: null, category }),
    uuid, now, now,
  );
  await enqueueSync('user_exercises', uuid, 'upsert', {
    name,
    primary_muscle: primaryMuscle,
    movement_pattern: null,
    equipment,
    category,
    is_compound: 0,
    tips: '',
    aliases: [],
    secondary_muscles: [],
    instructions: [],
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }, tx);
  return res.lastInsertRowId;
}

export async function importWorkouts(planned: readonly PlannedWorkout[], resolution: ImportResolution): Promise<ImportOutcome> {
  return mutate(['workout_logs', 'set_entries', 'exercises'], async (tx) => {
    const now = Date.now();
    if (planned.length === 0) return { importedWorkouts: 0, importedSets: 0, skippedExisting: 0, createdExercises: 0 };

    // Dedupe against what's already logged: one range read, keyed in JS.
    let min = Infinity;
    let max = -Infinity;
    for (const w of planned) {
      min = Math.min(min, w.startedAt);
      max = Math.max(max, w.startedAt);
    }
    const existing = await tx.getAllAsync<{ started_at: number; name: string }>(
      'SELECT started_at, name FROM workout_logs WHERE deleted_at IS NULL AND started_at BETWEEN ? AND ?',
      min - 60_000, max + 60_000,
    );
    const { fresh, skipped } = filterExisting(planned, existing);

    // Custom exercises: one per distinct normalised unmatched name.
    const idByName = new Map<string, number>();
    const customByNorm = new Map<string, number>();
    let createdExercises = 0;
    for (const w of fresh) {
      for (const e of w.exercises) {
        if (idByName.has(e.importName)) continue;
        const mapped = resolution.exerciseIds.get(e.importName);
        if (mapped != null) {
          idByName.set(e.importName, mapped);
          continue;
        }
        const norm = normaliseName(e.importName);
        let id = customByNorm.get(norm);
        if (id == null) {
          id = await createCustom(tx, e.importName.trim(), resolution.equipment.get(e.importName) ?? 'other', now);
          customByNorm.set(norm, id);
          createdExercises++;
        }
        idByName.set(e.importName, id);
      }
    }

    const setIds: number[] = [];
    for (const w of fresh) {
      const logUuid = newUuid();
      let volume = 0;
      for (const e of w.exercises) for (const s of e.sets) volume += s.weightKg * s.reps;
      const duration = Math.max(0, Math.round((w.endedAt - w.startedAt) / 1000));
      const res = await tx.runAsync(
        `INSERT INTO workout_logs (template_id, name, started_at, ended_at, duration_seconds, total_volume, unit, notes, uuid, created_at, updated_at) VALUES (NULL, ?, ?, ?, ?, ?, 'metric', ?, ?, ?, ?)`,
        w.name, w.startedAt, w.endedAt, duration, volume, w.notes, logUuid, now, now,
      );
      const logId = res.lastInsertRowId;
      await enqueueSync('workout_logs', logUuid, 'upsert', {
        template_uuid: null,
        name: w.name,
        started_at: w.startedAt,
        ended_at: w.endedAt,
        duration_seconds: duration,
        total_volume: volume,
        unit: 'metric',
        notes: w.notes,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }, tx);
      for (let order = 0; order < w.exercises.length; order++) {
        const e = w.exercises[order];
        const exerciseId = idByName.get(e.importName)!;
        for (let i = 0; i < e.sets.length; i++) {
          const s = e.sets[i];
          const setRes = await tx.runAsync(
            `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, rest_seconds, set_type, rpe, sort_order, uuid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, NULL, ?, ?, ?, ?, ?, ?)`,
            logId, exerciseId, i, s.weightKg, s.reps, s.setType, s.rpe, order, newUuid(), now, now,
          );
          setIds.push(setRes.lastInsertRowId);
        }
      }
    }
    for (let i = 0; i < setIds.length; i += ENQUEUE_CHUNK) {
      await enqueueSetUpserts(tx, setIds.slice(i, i + ENQUEUE_CHUNK));
    }

    return {
      importedWorkouts: fresh.length,
      importedSets: setIds.length,
      skippedExisting: skipped,
      createdExercises,
    };
  });
}

