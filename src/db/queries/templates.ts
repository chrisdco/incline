import { openDatabase } from '../client';
import { newUuid } from '@/lib/uuid';
import { enqueueSync } from '@/sync/outbox';
import { exerciseRefForId } from '@/sync/exercise-ref';
import { scaleDeloadSets } from '@/coaching/deload';
import type { Difficulty, MuscleGroup, TemplateExercise, WorkoutTemplate } from '../types';
import { getExercise } from './exercises';
import {
  mapTemplate,
  type TemplateExerciseRow,
  type TemplateRow,
} from './helpers';

export async function listTemplates(): Promise<WorkoutTemplate[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<TemplateRow>(
    'SELECT * FROM workout_templates WHERE deleted_at IS NULL ORDER BY name',
  );
  return rows.map((t) => mapTemplate(t, []));
}

export async function getTemplate(id: number): Promise<WorkoutTemplate | null> {
  const db = await openDatabase();
  const t = await db.getFirstAsync<TemplateRow>(
    'SELECT * FROM workout_templates WHERE id = ? AND deleted_at IS NULL',
    id,
  );
  if (!t) return null;
  const teRows = await db.getAllAsync<TemplateExerciseRow>(
    'SELECT * FROM template_exercises WHERE template_id = ? AND deleted_at IS NULL ORDER BY sort_order',
    id,
  );
  const exercises: TemplateExercise[] = [];
  for (const te of teRows) {
    const exercise = await getExercise(te.exercise_id);
    exercises.push({
      id: te.id,
      templateId: te.template_id,
      exerciseId: te.exercise_id,
      sortOrder: te.sort_order,
      targetSets: te.target_sets,
      targetRepsMin: te.target_reps_min,
      targetRepsMax: te.target_reps_max,
      restSeconds: te.rest_seconds,
      notes: te.notes,
      supersetGroup: te.superset_group ?? null,
      exercise: exercise ?? undefined,
    });
  }
  return mapTemplate(t, exercises);
}

export interface TemplateSummary {
  template: WorkoutTemplate;
  exerciseCount: number;
  muscleFocus: MuscleGroup[];
  /** First few exercise names (for previews). */
  exerciseNames: string[];
}

export async function listTemplateSummaries(): Promise<TemplateSummary[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<TemplateRow>(
    'SELECT * FROM workout_templates WHERE deleted_at IS NULL ORDER BY name',
  );
  const out: TemplateSummary[] = [];
  for (const t of rows) {
    const countRow = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM template_exercises WHERE template_id = ? AND deleted_at IS NULL',
      t.id,
    );
    const muscleRows = await db.getAllAsync<{ primary_muscle: string }>(
      'SELECT DISTINCT e.primary_muscle FROM template_exercises te JOIN exercises e ON e.id = te.exercise_id WHERE te.template_id = ? AND te.deleted_at IS NULL AND e.deleted_at IS NULL',
      t.id,
    );
    const exerciseRows = await db.getAllAsync<{ name: string }>(
      'SELECT e.name FROM template_exercises te JOIN exercises e ON e.id = te.exercise_id WHERE te.template_id = ? AND te.deleted_at IS NULL AND e.deleted_at IS NULL ORDER BY te.sort_order LIMIT 4',
      t.id,
    );
    out.push({
      template: mapTemplate(t, []),
      exerciseCount: countRow?.c ?? 0,
      muscleFocus: muscleRows.map((r) => r.primary_muscle as MuscleGroup),
      exerciseNames: exerciseRows.map((r) => r.name),
    });
  }
  return out;
}

export async function getSuggestedTemplate(): Promise<WorkoutTemplate | null> {
  const db = await openDatabase();
  const last = await db.getFirstAsync<{ template_id: number | null }>(
    'SELECT template_id FROM workout_logs WHERE ended_at IS NOT NULL AND template_id IS NOT NULL AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1',
  );
  if (last?.template_id) {
    const recent = await getTemplate(last.template_id);
    if (recent) return recent;
  }
  const frequent = await db.getFirstAsync<{ template_id: number }>(
    `SELECT template_id, COUNT(*) as c FROM workout_logs
     WHERE ended_at IS NOT NULL AND template_id IS NOT NULL AND deleted_at IS NULL
       AND started_at >= ?
     GROUP BY template_id ORDER BY c DESC LIMIT 1`,
    Date.now() - 30 * 86_400_000,
  );
  if (frequent?.template_id) {
    const t = await getTemplate(frequent.template_id);
    if (t) return t;
  }
  const first = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM workout_templates WHERE deleted_at IS NULL ORDER BY is_custom DESC, name ASC LIMIT 1',
  );
  return first ? getTemplate(first.id) : null;
}

async function enqueueTemplateUpsert(templateId: number): Promise<void> {
  const db = await openDatabase();
  const t = await db.getFirstAsync<TemplateRow>('SELECT * FROM workout_templates WHERE id = ?', templateId);
  if (!t?.uuid || !t.is_custom) return;
  await enqueueSync('user_templates', t.uuid, 'upsert', {
    name: t.name,
    description: t.description,
    category: t.category,
    difficulty: t.difficulty,
    estimated_minutes: t.estimated_minutes,
    created_at: t.created_at,
    updated_at: t.updated_at,
    deleted_at: t.deleted_at,
  });
}

async function enqueueTemplateExerciseUpsert(teId: number): Promise<void> {
  const db = await openDatabase();
  const te = await db.getFirstAsync<TemplateExerciseRow & { template_uuid: string | null; is_custom: number }>(
    `SELECT te.*, t.uuid as template_uuid, t.is_custom as is_custom
     FROM template_exercises te
     JOIN workout_templates t ON t.id = te.template_id
     WHERE te.id = ?`,
    teId,
  );
  if (!te?.uuid || !te.is_custom || !te.template_uuid) return;
  const exRef = await exerciseRefForId(te.exercise_id);
  await enqueueSync('user_template_exercises', te.uuid, te.deleted_at ? 'delete' : 'upsert', {
    template_uuid: te.template_uuid,
    exercise_ref: exRef,
    sort_order: te.sort_order,
    target_sets: te.target_sets,
    target_reps_min: te.target_reps_min,
    target_reps_max: te.target_reps_max,
    rest_seconds: te.rest_seconds,
    notes: te.notes,
    superset_group: te.superset_group ?? null,
    updated_at: te.updated_at,
    deleted_at: te.deleted_at,
  });
}

export async function createTemplate(name: string, description: string, difficulty: Difficulty): Promise<number> {
  const db = await openDatabase();
  const now = Date.now();
  const uuid = newUuid();
  const res = await db.runAsync(
    `INSERT INTO workout_templates (name, description, category, difficulty, estimated_minutes, is_custom, uuid, created_at, updated_at) VALUES (?, ?, 'strength', ?, 45, 1, ?, ?, ?)`,
    name, description, difficulty, uuid, now, now,
  );
  const id = res.lastInsertRowId as number;
  await enqueueTemplateUpsert(id);
  return id;
}

export async function updateTemplate(id: number, patch: Partial<Pick<WorkoutTemplate, 'name' | 'description' | 'difficulty' | 'estimatedMinutes'>>): Promise<void> {
  const db = await openDatabase();
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); args.push(patch.name); }
  if (patch.description !== undefined) { sets.push('description = ?'); args.push(patch.description); }
  if (patch.difficulty !== undefined) { sets.push('difficulty = ?'); args.push(patch.difficulty); }
  if (patch.estimatedMinutes !== undefined) { sets.push('estimated_minutes = ?'); args.push(patch.estimatedMinutes); }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  args.push(Date.now());
  args.push(id);
  await db.runAsync(`UPDATE workout_templates SET ${sets.join(', ')} WHERE id = ?`, ...args);
  await enqueueTemplateUpsert(id);
}

export async function deleteTemplate(id: number): Promise<void> {
  const db = await openDatabase();
  const t = await db.getFirstAsync<TemplateRow>('SELECT * FROM workout_templates WHERE id = ?', id);
  if (!t) return;
  const now = Date.now();

  if (!t.is_custom) {
    // Seed templates: hard-delete children only if explicitly deleted (legacy behavior)
    await db.runAsync('DELETE FROM template_exercises WHERE template_id = ?', id);
    await db.runAsync('DELETE FROM workout_templates WHERE id = ?', id);
    return;
  }

  const children = await db.getAllAsync<{ id: number; uuid: string | null }>(
    'SELECT id, uuid FROM template_exercises WHERE template_id = ? AND deleted_at IS NULL',
    id,
  );
  for (const child of children) {
    await db.runAsync(
      'UPDATE template_exercises SET deleted_at = ?, updated_at = ? WHERE id = ?',
      now, now, child.id,
    );
    if (child.uuid) {
      await enqueueSync('user_template_exercises', child.uuid, 'delete', {
        updated_at: now,
        deleted_at: now,
      });
    }
  }
  await db.runAsync(
    'UPDATE workout_templates SET deleted_at = ?, updated_at = ? WHERE id = ?',
    now, now, id,
  );
  if (t.uuid) {
    await enqueueSync('user_templates', t.uuid, 'delete', {
      updated_at: now,
      deleted_at: now,
    });
  }
}

export async function addExerciseToTemplate(
  templateId: number,
  exerciseId: number,
  targetSets: number,
  targetRepsMin: number,
  targetRepsMax: number,
  restSeconds: number,
): Promise<number> {
  const db = await openDatabase();
  const now = Date.now();
  const uuid = newUuid();
  const maxOrder = await db.getFirstAsync<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), -1) as m FROM template_exercises WHERE template_id = ? AND deleted_at IS NULL',
    templateId,
  );
  const nextOrder = (maxOrder?.m ?? -1) + 1;
  const res = await db.runAsync(
    `INSERT INTO template_exercises (template_id, exercise_id, sort_order, target_sets, target_reps_min, target_reps_max, rest_seconds, notes, uuid, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?)`,
    templateId, exerciseId, nextOrder, targetSets, targetRepsMin, targetRepsMax, restSeconds, uuid, now,
  );
  const id = res.lastInsertRowId as number;
  await db.runAsync('UPDATE workout_templates SET updated_at = ? WHERE id = ?', now, templateId);
  await enqueueTemplateUpsert(templateId);
  await enqueueTemplateExerciseUpsert(id);
  return id;
}

export async function updateTemplateExercise(
  id: number,
  patch: Partial<Pick<TemplateExercise, 'targetSets' | 'targetRepsMin' | 'targetRepsMax' | 'restSeconds' | 'notes' | 'supersetGroup'>>,
): Promise<void> {
  const db = await openDatabase();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.targetSets !== undefined) { sets.push('target_sets = ?'); args.push(patch.targetSets); }
  if (patch.targetRepsMin !== undefined) { sets.push('target_reps_min = ?'); args.push(patch.targetRepsMin); }
  if (patch.targetRepsMax !== undefined) { sets.push('target_reps_max = ?'); args.push(patch.targetRepsMax); }
  if (patch.restSeconds !== undefined) { sets.push('rest_seconds = ?'); args.push(patch.restSeconds); }
  if (patch.notes !== undefined) { sets.push('notes = ?'); args.push(patch.notes); }
  if (patch.supersetGroup !== undefined) { sets.push('superset_group = ?'); args.push(patch.supersetGroup); }
  if (sets.length === 0) return;
  const now = Date.now();
  sets.push('updated_at = ?');
  args.push(now);
  args.push(id);
  await db.runAsync(`UPDATE template_exercises SET ${sets.join(', ')} WHERE id = ?`, ...args);
  await enqueueTemplateExerciseUpsert(id);
}

export async function removeTemplateExercise(id: number): Promise<void> {
  const db = await openDatabase();
  const te = await db.getFirstAsync<TemplateExerciseRow & { is_custom: number }>(
    `SELECT te.*, t.is_custom as is_custom FROM template_exercises te
     JOIN workout_templates t ON t.id = te.template_id WHERE te.id = ?`,
    id,
  );
  if (!te) return;
  const now = Date.now();
  if (!te.is_custom) {
    await db.runAsync('DELETE FROM template_exercises WHERE id = ?', id);
    return;
  }
  await db.runAsync(
    'UPDATE template_exercises SET deleted_at = ?, updated_at = ? WHERE id = ?',
    now, now, id,
  );
  await enqueueTemplateExerciseUpsert(id);
}

export async function reorderTemplateExercises(templateId: number, exerciseIds: number[]): Promise<void> {
  const db = await openDatabase();
  const now = Date.now();
  for (let i = 0; i < exerciseIds.length; i++) {
    await db.runAsync(
      'UPDATE template_exercises SET sort_order = ?, updated_at = ? WHERE id = ? AND template_id = ?',
      i, now, exerciseIds[i], templateId,
    );
    await enqueueTemplateExerciseUpsert(exerciseIds[i]);
  }
  await db.runAsync('UPDATE workout_templates SET updated_at = ? WHERE id = ?', now, templateId);
  await enqueueTemplateUpsert(templateId);
}

/** Link two adjacent template exercises into one superset group. */
export async function linkTemplateExerciseWithNext(templateExerciseId: number): Promise<void> {
  const db = await openDatabase();
  const te = await db.getFirstAsync<TemplateExerciseRow>(
    'SELECT * FROM template_exercises WHERE id = ? AND deleted_at IS NULL',
    templateExerciseId,
  );
  if (!te) return;
  const next = await db.getFirstAsync<TemplateExerciseRow>(
    `SELECT * FROM template_exercises
     WHERE template_id = ? AND deleted_at IS NULL AND sort_order > ?
     ORDER BY sort_order ASC LIMIT 1`,
    te.template_id,
    te.sort_order,
  );
  if (!next) return;

  let groupId = te.superset_group ?? next.superset_group;
  if (groupId == null) {
    const max = await db.getFirstAsync<{ m: number | null }>(
      'SELECT MAX(superset_group) as m FROM template_exercises WHERE template_id = ?',
      te.template_id,
    );
    groupId = (max?.m ?? 0) + 1;
  }
  await updateTemplateExercise(te.id, { supersetGroup: groupId });
  await updateTemplateExercise(next.id, { supersetGroup: groupId });
}

export async function unlinkTemplateExercise(templateExerciseId: number): Promise<void> {
  await updateTemplateExercise(templateExerciseId, { supersetGroup: null });
}

/** Copy a routine (custom or seed) into a new custom template with the same exercises. */
export async function duplicateTemplate(sourceId: number): Promise<number> {
  const source = await getTemplate(sourceId);
  if (!source) throw new Error('Template not found');
  const copyName = `${source.name} (copy)`;
  const newId = await createTemplate(copyName, source.description, source.difficulty);
  for (const te of source.exercises ?? []) {
    const teId = await addExerciseToTemplate(
      newId,
      te.exerciseId,
      te.targetSets,
      te.targetRepsMin,
      te.targetRepsMax,
      te.restSeconds,
    );
    if (te.notes?.trim()) {
      await updateTemplateExercise(teId, { notes: te.notes });
    }
  }
  return newId;
}

/** User-confirmed deload copy: fewer sets, original routine unchanged. */
export async function createDeloadTemplate(sourceId: number): Promise<number> {
  const source = await getTemplate(sourceId);
  if (!source) throw new Error('Template not found');
  const copyName = source.name.startsWith('Deload') ? source.name : `Deload — ${source.name}`;
  const newId = await createTemplate(
    copyName,
    'Reduced-volume week. Your original routine was not changed.',
    source.difficulty,
  );
  for (const te of source.exercises ?? []) {
    const teId = await addExerciseToTemplate(
      newId,
      te.exerciseId,
      scaleDeloadSets(te.targetSets),
      te.targetRepsMin,
      te.targetRepsMax,
      te.restSeconds,
    );
    if (te.notes?.trim()) {
      await updateTemplateExercise(teId, { notes: te.notes });
    }
  }
  return newId;
}

/**
 * Create a custom template from a finished workout's completed exercises.
 * Target sets/reps come from what was logged (avg reps, set count).
 */
export async function createTemplateFromWorkoutLog(logId: number): Promise<number> {
  const db = await openDatabase();
  const log = await db.getFirstAsync<{ name: string }>(
    'SELECT name FROM workout_logs WHERE id = ? AND deleted_at IS NULL',
    logId,
  );
  if (!log) throw new Error('Workout not found');

  const rows = await db.getAllAsync<{
    exercise_id: number;
    set_count: number;
    avg_reps: number;
    rest_seconds: number | null;
  }>(
    `SELECT s.exercise_id,
            COUNT(*) as set_count,
            CAST(ROUND(AVG(s.reps)) AS INTEGER) as avg_reps,
            MAX(s.rest_seconds) as rest_seconds
     FROM set_entries s
     WHERE s.workout_log_id = ? AND s.completed = 1 AND s.deleted_at IS NULL
     GROUP BY s.exercise_id
     ORDER BY MIN(s.id)`,
    logId,
  );
  if (rows.length === 0) throw new Error('No completed sets to save');

  const name = log.name?.trim() ? `${log.name} template` : 'Saved workout';
  const templateId = await createTemplate(name, 'Saved from a completed workout', 'intermediate');

  for (const row of rows) {
    const reps = Math.max(1, row.avg_reps || 8);
    await addExerciseToTemplate(
      templateId,
      row.exercise_id,
      Math.max(1, row.set_count),
      Math.max(1, reps - 2),
      reps + 2,
      row.rest_seconds ?? 90,
    );
  }
  return templateId;
}
