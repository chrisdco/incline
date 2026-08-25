import { openDatabase } from '../client';
import { PAGINATION } from '@/constants/config';
import { newUuid } from '@/lib/uuid';
import { enqueueSync } from '@/sync/outbox';
import { exerciseRefForId } from '@/sync/exercise-ref';
import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  FeedWorkoutLog,
  MuscleGroup,
  Paginated,
  WorkoutLog,
} from '../types';
import { getCelebrationPrCounts } from './coaching/prs';
import { deletePhotosForWorkout } from './photos';
import { getLastSetsForExercise, getLastSetsForExercises } from './exercises';
import {
  getSessionSets,
  mapLog,
  recomputeVolume,
  type LogRow,
  type SessionWorkout,
  type SetRow,
  type TemplateExerciseRow,
} from './helpers';
import { ghostWorkingSql, type SessionGhost } from '@/lib/session-ghost';

export type { SessionGhost };

export interface MuscleSplit {
  muscle: MuscleGroup;
  percentage: number;
  sets: number;
}

async function enqueueLogUpsert(logId: number): Promise<void> {
  const db = await openDatabase();
  const log = await db.getFirstAsync<LogRow & { template_uuid: string | null }>(
    `SELECT w.*, t.uuid as template_uuid
     FROM workout_logs w
     LEFT JOIN workout_templates t ON t.id = w.template_id AND t.is_custom = 1
     WHERE w.id = ?`,
    logId,
  );
  if (!log?.uuid) return;
  await enqueueSync('workout_logs', log.uuid, log.deleted_at ? 'delete' : 'upsert', {
    template_uuid: log.template_uuid,
    name: log.name,
    started_at: log.started_at,
    ended_at: log.ended_at,
    duration_seconds: log.duration_seconds,
    total_volume: log.total_volume,
    unit: log.unit,
    notes: log.notes,
    created_at: log.created_at,
    updated_at: log.updated_at,
    deleted_at: log.deleted_at,
  });
}

async function enqueueSetUpsert(setId: number): Promise<void> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<SetRow & { log_uuid: string | null }>(
    `SELECT s.*, w.uuid as log_uuid FROM set_entries s
     JOIN workout_logs w ON w.id = s.workout_log_id WHERE s.id = ?`,
    setId,
  );
  if (!row?.uuid || !row.log_uuid) return;
  const exRef = await exerciseRefForId(row.exercise_id);
  await enqueueSync('set_entries', row.uuid, row.deleted_at ? 'delete' : 'upsert', {
    workout_log_uuid: row.log_uuid,
    exercise_ref: exRef,
    set_index: row.set_index,
    weight: row.weight,
    reps: row.reps,
    completed: row.completed,
    rest_seconds: row.rest_seconds,
    superset_group: row.superset_group,
    set_type: row.set_type ?? 'working',
    rpe: row.rpe ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  });
}

/** Sync enqueue must not block session UX — fire and forget. */
function enqueueLogUpsertBackground(logId: number): void {
  void enqueueLogUpsert(logId).catch(() => {});
}

function enqueueSetUpsertsBackground(setIds: number[]): void {
  if (setIds.length === 0) return;
  void Promise.all(setIds.map((id) => enqueueSetUpsert(id))).catch(() => {});
}

/** Calculate the muscle group distribution for a completed workout (by completed set count). */
export async function getWorkoutMuscleSplit(logId: number): Promise<MuscleSplit[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<{ primary_muscle: string; count: number }>(
    `SELECT e.primary_muscle, COUNT(s.id) as count
     FROM set_entries s
     JOIN exercises e ON e.id = s.exercise_id
     WHERE s.workout_log_id = ? AND s.completed = 1 AND s.deleted_at IS NULL
     GROUP BY e.primary_muscle
     ORDER BY count DESC`,
    logId,
  );
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  if (total === 0) return [];
  return rows.map((r) => ({
    muscle: r.primary_muscle as MuscleGroup,
    percentage: Math.round((r.count / total) * 100),
    sets: r.count,
  }));
}

export async function getActiveWorkout(): Promise<SessionWorkout | null> {
  const db = await openDatabase();
  const log = await db.getFirstAsync<LogRow>(
    'SELECT * FROM workout_logs WHERE ended_at IS NULL AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1',
  );
  if (!log) return null;
  return { ...mapLog(log), sets: await getSessionSets(log.id) };
}

export async function getWorkoutLog(id: number): Promise<SessionWorkout | null> {
  const db = await openDatabase();
  const log = await db.getFirstAsync<LogRow>(
    'SELECT * FROM workout_logs WHERE id = ? AND deleted_at IS NULL',
    id,
  );
  if (!log) return null;
  return { ...mapLog(log), sets: await getSessionSets(log.id) };
}

export async function getRestDefaultsForSession(logId: number): Promise<Record<number, number>> {
  const db = await openDatabase();
  const log = await db.getFirstAsync<{ template_id: number | null }>(
    'SELECT template_id FROM workout_logs WHERE id = ?',
    logId,
  );
  const exRows = await db.getAllAsync<{ exercise_id: number }>(
    'SELECT DISTINCT exercise_id FROM set_entries WHERE workout_log_id = ? AND deleted_at IS NULL',
    logId,
  );
  const ids = exRows.map((e) => e.exercise_id);
  if (ids.length === 0) return {};
  const map: Record<number, number> = {};
  if (log?.template_id != null) {
    const teRows = await db.getAllAsync<{ exercise_id: number; rest_seconds: number }>(
      'SELECT exercise_id, rest_seconds FROM template_exercises WHERE template_id = ? AND deleted_at IS NULL',
      log.template_id,
    );
    for (const te of teRows) map[te.exercise_id] = te.rest_seconds;
  }
  const placeholders = ids.map(() => '?').join(',');
  const exDefaults = await db.getAllAsync<{ id: number; default_rest_seconds: number }>(
    `SELECT id, default_rest_seconds FROM exercises WHERE id IN (${placeholders})`,
    ...ids,
  );
  for (const ex of exDefaults) {
    if (map[ex.id] === undefined) map[ex.id] = ex.default_rest_seconds;
  }
  return map;
}

export async function startWorkout(templateId: number | null, name: string): Promise<number> {
  const db = await openDatabase();
  const now = Date.now();
  const logUuid = newUuid();
  let logId = 0;
  const setIds: number[] = [];

  let teRows: TemplateExerciseRow[] = [];
  let lastByExercise: Record<number, Awaited<ReturnType<typeof getLastSetsForExercise>>> = {};
  if (templateId != null) {
    teRows = await db.getAllAsync<TemplateExerciseRow>(
      'SELECT * FROM template_exercises WHERE template_id = ? AND deleted_at IS NULL ORDER BY sort_order',
      templateId,
    );
    lastByExercise = await getLastSetsForExercises(teRows.map((te) => te.exercise_id));
  }

  await db.withTransactionAsync(async () => {
    const res = await db.runAsync(
      `INSERT INTO workout_logs (template_id, name, started_at, ended_at, duration_seconds, total_volume, unit, notes, uuid, created_at, updated_at) VALUES (?, ?, ?, NULL, 0, 0, 'metric', '', ?, ?, ?)`,
      templateId, name, now, logUuid, now, now,
    );
    logId = res.lastInsertRowId as number;
    for (const te of teRows) {
      const last = lastByExercise[te.exercise_id] ?? [];
      for (let s = 0; s < te.target_sets; s++) {
        const setRes = await db.runAsync(
          `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, rest_seconds, superset_group, uuid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?)`,
          logId, te.exercise_id, s, last[s]?.weight ?? 0, last[s]?.reps ?? te.target_reps_min, te.superset_group ?? null, newUuid(), now, now,
        );
        setIds.push(setRes.lastInsertRowId as number);
      }
    }
  });
  enqueueLogUpsertBackground(logId);
  enqueueSetUpsertsBackground(setIds);
  return logId;
}

export async function addExerciseToWorkout(logId: number, exerciseId: number): Promise<number> {
  const db = await openDatabase();
  const now = Date.now();
  const last = await getLastSetsForExercise(exerciseId);
  const existing = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM set_entries WHERE workout_log_id = ? AND exercise_id = ? AND deleted_at IS NULL',
    logId, exerciseId,
  );
  const setIndex = existing?.c ?? 0;
  const res = await db.runAsync(
    `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, rest_seconds, uuid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)`,
    logId, exerciseId, setIndex, last[0]?.weight ?? 0, last[0]?.reps ?? 0, newUuid(), now, now,
  );
  const setId = res.lastInsertRowId as number;
  await recomputeVolume(logId);
  await enqueueSetUpsert(setId);
  await enqueueLogUpsert(logId);
  return setId;
}

export async function addWarmUpSet(logId: number, exerciseId: number): Promise<number> {
  const db = await openDatabase();
  const now = Date.now();
  const heaviest = await db.getFirstAsync<SetRow>(
    'SELECT * FROM set_entries WHERE workout_log_id = ? AND exercise_id = ? AND deleted_at IS NULL ORDER BY weight DESC LIMIT 1',
    logId, exerciseId,
  );
  const last = await db.getFirstAsync<SetRow>(
    'SELECT * FROM set_entries WHERE workout_log_id = ? AND exercise_id = ? AND deleted_at IS NULL ORDER BY set_index DESC LIMIT 1',
    logId, exerciseId,
  );
  const workingWeight = heaviest?.weight ?? 0;
  const warmUpWeight = Math.max(0, Math.round((workingWeight * 0.5) / 2.5) * 2.5);
  const nextIndex = last ? last.set_index + 1 : 0;
  const res = await db.runAsync(
    `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, rest_seconds, set_type, uuid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, NULL, 'warmup', ?, ?, ?)`,
    logId, exerciseId, nextIndex, warmUpWeight, heaviest?.reps ?? 10, newUuid(), now, now,
  );
  const setId = res.lastInsertRowId as number;
  await recomputeVolume(logId);
  await enqueueSetUpsert(setId);
  await enqueueLogUpsert(logId);
  return setId;
}

export async function addSet(logId: number, exerciseId: number): Promise<number> {
  const db = await openDatabase();
  const now = Date.now();
  const rows = await db.getAllAsync<SetRow>(
    'SELECT * FROM set_entries WHERE workout_log_id = ? AND exercise_id = ? AND deleted_at IS NULL ORDER BY set_index DESC LIMIT 1',
    logId, exerciseId,
  );
  const last = rows[0];
  const nextIndex = last ? last.set_index + 1 : 0;
  const res = await db.runAsync(
    `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, rest_seconds, uuid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)`,
    logId, exerciseId, nextIndex, last?.weight ?? 0, last?.reps ?? 0, newUuid(), now, now,
  );
  const setId = res.lastInsertRowId as number;
  await recomputeVolume(logId);
  await enqueueSetUpsert(setId);
  await enqueueLogUpsert(logId);
  return setId;
}

export interface SetPatch {
  weight?: number;
  reps?: number;
  completed?: boolean;
  restSeconds?: number | null;
  rpe?: number | null;
}

export async function updateSet(setId: number, patch: SetPatch): Promise<void> {
  const db = await openDatabase();
  const sets: string[] = [];
  const args: (number | null)[] = [];
  if (patch.weight !== undefined) { sets.push('weight = ?'); args.push(patch.weight); }
  if (patch.reps !== undefined) { sets.push('reps = ?'); args.push(patch.reps); }
  if (patch.completed !== undefined) { sets.push('completed = ?'); args.push(patch.completed ? 1 : 0); }
  if (patch.restSeconds !== undefined) { sets.push('rest_seconds = ?'); args.push(patch.restSeconds); }
  if (patch.rpe !== undefined) {
    sets.push('rpe = ?');
    const n = patch.rpe;
    args.push(
      typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 10 ? Math.round(n) : null,
    );
  }
  if (sets.length === 0) return;
  const now = Date.now();
  sets.push('updated_at = ?');
  args.push(now);
  args.push(setId);
  await db.runAsync(`UPDATE set_entries SET ${sets.join(', ')} WHERE id = ?`, ...args);
  const row = await db.getFirstAsync<{ workout_log_id: number }>('SELECT workout_log_id FROM set_entries WHERE id = ?', setId);
  if (row) {
    await recomputeVolume(row.workout_log_id);
    await enqueueLogUpsert(row.workout_log_id);
  }
  await enqueueSetUpsert(setId);
}

export async function removeSet(setId: number): Promise<void> {
  const db = await openDatabase();
  const now = Date.now();
  const row = await db.getFirstAsync<{ workout_log_id: number; uuid: string | null }>(
    'SELECT workout_log_id, uuid FROM set_entries WHERE id = ?',
    setId,
  );
  await db.runAsync(
    'UPDATE set_entries SET deleted_at = ?, updated_at = ? WHERE id = ?',
    now, now, setId,
  );
  if (row) {
    await recomputeVolume(row.workout_log_id);
    await enqueueSetUpsert(setId);
    await enqueueLogUpsert(row.workout_log_id);
  }
}

export async function updateWorkoutNotes(logId: number, notes: string): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('UPDATE workout_logs SET notes = ?, updated_at = ? WHERE id = ?', notes, Date.now(), logId);
  await enqueueLogUpsert(logId);
}

export async function updateWorkoutLogStartedAt(logId: number, startedAt: number): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('UPDATE workout_logs SET started_at = ?, updated_at = ? WHERE id = ?', startedAt, Date.now(), logId);
  await enqueueLogUpsert(logId);
}

export async function updateWorkoutDuration(logId: number, seconds: number): Promise<void> {
  const db = await openDatabase();
  const log = await db.getFirstAsync<LogRow>('SELECT started_at FROM workout_logs WHERE id = ?', logId);
  if (!log) return;
  await db.runAsync(
    'UPDATE workout_logs SET duration_seconds = ?, ended_at = ?, updated_at = ? WHERE id = ?',
    seconds, log.started_at + seconds * 1000, Date.now(), logId,
  );
  await enqueueLogUpsert(logId);
}

export async function finishWorkout(logId: number, options?: { pausedMs?: number }): Promise<void> {
  const db = await openDatabase();
  const log = await db.getFirstAsync<LogRow>('SELECT * FROM workout_logs WHERE id = ?', logId);
  if (!log) return;
  const now = Date.now();
  const pausedMs = Math.max(0, options?.pausedMs ?? 0);
  const duration = Math.max(0, Math.floor((now - log.started_at - pausedMs) / 1000));

  const incomplete = await db.getAllAsync<{ id: number }>(
    `SELECT id FROM set_entries
     WHERE workout_log_id = ? AND completed = 0 AND deleted_at IS NULL`,
    logId,
  );
  if (incomplete.length > 0) {
    await db.runAsync(
      `UPDATE set_entries SET deleted_at = ?, updated_at = ?
       WHERE workout_log_id = ? AND completed = 0 AND deleted_at IS NULL`,
      now, now, logId,
    );
  }

  await recomputeVolume(logId);
  await db.runAsync(
    'UPDATE workout_logs SET ended_at = ?, duration_seconds = ?, updated_at = ? WHERE id = ?',
    now, duration, now, logId,
  );
  enqueueSetUpsertsBackground(incomplete.map((r) => r.id));
  enqueueLogUpsertBackground(logId);
}

/** Undo a soft-deleted set within the same session (preserves uuid for sync). */
export async function restoreSet(setId: number): Promise<void> {
  const db = await openDatabase();
  const now = Date.now();
  const row = await db.getFirstAsync<{ workout_log_id: number }>(
    'SELECT workout_log_id FROM set_entries WHERE id = ?',
    setId,
  );
  if (!row) return;
  await db.runAsync(
    'UPDATE set_entries SET deleted_at = NULL, updated_at = ? WHERE id = ?',
    now, setId,
  );
  await recomputeVolume(row.workout_log_id);
  enqueueSetUpsertsBackground([setId]);
  enqueueLogUpsertBackground(row.workout_log_id);
}

export async function discardWorkout(logId: number): Promise<void> {
  const db = await openDatabase();
  const now = Date.now();
  const sets = await db.getAllAsync<{ id: number }>(
    'SELECT id FROM set_entries WHERE workout_log_id = ? AND deleted_at IS NULL',
    logId,
  );
  await db.runAsync(
    'UPDATE set_entries SET deleted_at = ?, updated_at = ? WHERE workout_log_id = ? AND deleted_at IS NULL',
    now, now, logId,
  );
  await db.runAsync(
    'UPDATE workout_logs SET deleted_at = ?, updated_at = ? WHERE id = ?',
    now, now, logId,
  );
  enqueueSetUpsertsBackground(sets.map((s) => s.id));
  enqueueLogUpsertBackground(logId);
  await deletePhotosForWorkout(logId);
}

/** Optional filters for paginated workout history (Progress → History). */
export type WorkoutLogFilters = {
  /** Inclusive lower bound on `started_at` (ms). Omit for all time. */
  sinceMs?: number;
  templateId?: number;
  exerciseId?: number;
};

export async function listWorkoutLogs(
  offset = 0,
  limit = PAGINATION.pageSize,
  filters: WorkoutLogFilters = {},
): Promise<Paginated<WorkoutLog>> {
  const db = await openDatabase();
  const clauses = ['w.ended_at IS NOT NULL', 'w.deleted_at IS NULL'];
  const params: (number | string)[] = [];

  if (filters.sinceMs != null && filters.sinceMs > 0) {
    clauses.push('w.started_at >= ?');
    params.push(filters.sinceMs);
  }
  if (filters.templateId != null) {
    clauses.push('w.template_id = ?');
    params.push(filters.templateId);
  }
  if (filters.exerciseId != null) {
    clauses.push(
      `EXISTS (
        SELECT 1 FROM set_entries s
        WHERE s.workout_log_id = w.id
          AND s.exercise_id = ?
          AND s.completed = 1
          AND s.deleted_at IS NULL
      )`,
    );
    params.push(filters.exerciseId);
  }

  params.push(limit, offset);
  const rows = await db.getAllAsync<LogRow>(
    `SELECT w.* FROM workout_logs w
     WHERE ${clauses.join(' AND ')}
     ORDER BY w.started_at DESC
     LIMIT ? OFFSET ?`,
    ...params,
  );
  const items = rows.map(mapLog);
  const nextOffset = items.length === limit ? offset + limit : null;
  return { items, nextOffset };
}

/** Exercises that appear in at least one completed workout — for history filters. */
export async function listExercisesUsedInHistory(): Promise<{ id: number; name: string }[]> {
  const db = await openDatabase();
  return db.getAllAsync<{ id: number; name: string }>(
    `SELECT DISTINCT e.id, e.name
     FROM exercises e
     JOIN set_entries s ON s.exercise_id = e.id AND s.completed = 1 AND s.deleted_at IS NULL
     JOIN workout_logs w ON w.id = s.workout_log_id AND w.ended_at IS NOT NULL AND w.deleted_at IS NULL
     WHERE e.deleted_at IS NULL
     ORDER BY e.name COLLATE NOCASE`,
  );
}

export async function listWorkoutFeedLogs(offset = 0, limit = PAGINATION.pageSize): Promise<Paginated<FeedWorkoutLog>> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<LogRow>(
    'SELECT * FROM workout_logs WHERE ended_at IS NOT NULL AND deleted_at IS NULL ORDER BY started_at DESC LIMIT ? OFFSET ?',
    limit,
    offset,
  );
  if (rows.length === 0) return { items: [], nextOffset: null };
  const items = await enrichWorkoutFeed(db, rows);
  const nextOffset = items.length === limit ? offset + limit : null;
  return { items, nextOffset };
}

export async function getWorkoutFeedForDay(dayMs: number): Promise<FeedWorkoutLog[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<LogRow>(
    `SELECT * FROM workout_logs WHERE ended_at IS NOT NULL AND deleted_at IS NULL AND started_at >= ? AND started_at < ? ORDER BY started_at DESC`,
    dayMs, dayMs + 86_400_000,
  );
  if (rows.length === 0) return [];
  return enrichWorkoutFeed(db, rows);
}

async function enrichWorkoutFeed(db: SQLiteDatabase, rows: LogRow[]): Promise<FeedWorkoutLog[]> {
  const logIds = rows.map((r) => r.id);
  const placeholders = logIds.map(() => '?').join(',');

  const allSets = await db.getAllAsync<SetRow & { exercise_name: string }>(
    `SELECT s.*, e.name as exercise_name FROM set_entries s
     JOIN exercises e ON e.id = s.exercise_id
     WHERE s.workout_log_id IN (${placeholders}) AND s.deleted_at IS NULL AND s.completed = 1
     ORDER BY s.workout_log_id, s.exercise_id, s.set_index`,
    ...logIds,
  );

  const exerciseIds = [...new Set(allSets.map((s) => s.exercise_id))];
  const imgPlaceholders = exerciseIds.map(() => '?').join(',');
  const imgRows = exerciseIds.length > 0
    ? await db.getAllAsync<{ exercise_id: number; url: string }>(
        `SELECT exercise_id, url FROM exercise_images WHERE exercise_id IN (${imgPlaceholders}) AND is_primary = 1`,
        ...exerciseIds,
      )
    : [];
  const imgMap = new Map<number, string>();
  for (const r of imgRows) imgMap.set(r.exercise_id, r.url);

  const exerciseMap = new Map<number, Map<number, { exerciseId: number; exerciseName: string; setCount: number; imageUrl: string | null }>>();
  for (const s of allSets) {
    if (!exerciseMap.has(s.workout_log_id)) exerciseMap.set(s.workout_log_id, new Map());
    const exMap = exerciseMap.get(s.workout_log_id)!;
    const existing = exMap.get(s.exercise_id);
    if (existing) {
      existing.setCount++;
    } else {
      exMap.set(s.exercise_id, {
        exerciseId: s.exercise_id,
        exerciseName: s.exercise_name,
        setCount: 1,
        imageUrl: imgMap.get(s.exercise_id) ?? null,
      });
    }
  }

  const prCounts = await getCelebrationPrCounts(logIds);

  return rows.map((r) => {
    const log = mapLog(r);
    const exMap = exerciseMap.get(r.id);
    return {
      ...log,
      exercises: exMap ? [...exMap.values()] : [],
      prCount: prCounts.get(r.id) ?? 0,
    };
  });
}

/** Volume of the previous completed log with the same template (null if none / no template). */
export async function getPreviousTemplateVolume(
  logId: number,
): Promise<{ previousVolume: number; deltaPct: number | null } | null> {
  const db = await openDatabase();
  const current = await db.getFirstAsync<{ template_id: number | null; total_volume: number; started_at: number }>(
    'SELECT template_id, total_volume, started_at FROM workout_logs WHERE id = ? AND deleted_at IS NULL',
    logId,
  );
  if (!current?.template_id) return null;

  const prev = await db.getFirstAsync<{ total_volume: number }>(
    `SELECT total_volume FROM workout_logs
     WHERE template_id = ? AND id != ? AND ended_at IS NOT NULL AND deleted_at IS NULL
       AND started_at < ?
     ORDER BY started_at DESC LIMIT 1`,
    current.template_id,
    logId,
    current.started_at,
  );
  if (!prev) return null;

  const previousVolume = prev.total_volume;
  let deltaPct: number | null = null;
  if (previousVolume > 0) {
    deltaPct = Math.round(((current.total_volume - previousVolume) / previousVolume) * 100);
  }
  return { previousVolume, deltaPct };
}

export async function getSessionGhost(opts: {
  templateId?: number | null;
  name?: string | null;
  beforeStartedAt?: number;
  excludeLogId?: number;
}): Promise<SessionGhost | null> {
  const db = await openDatabase();
  const before = opts.beforeStartedAt ?? Date.now();
  const exclude = opts.excludeLogId ?? -1;

  let prev: { id: number; started_at: number; duration_seconds: number } | null = null;
  if (opts.templateId) {
    prev = await db.getFirstAsync(
      `SELECT id, started_at, duration_seconds FROM workout_logs
       WHERE template_id = ? AND id != ? AND ended_at IS NOT NULL AND deleted_at IS NULL
         AND started_at < ?
       ORDER BY started_at DESC LIMIT 1`,
      opts.templateId,
      exclude,
      before,
    );
  } else if (opts.name) {
    prev = await db.getFirstAsync(
      `SELECT id, started_at, duration_seconds FROM workout_logs
       WHERE template_id IS NULL AND name = ? AND id != ? AND ended_at IS NOT NULL AND deleted_at IS NULL
         AND started_at < ?
       ORDER BY started_at DESC LIMIT 1`,
      opts.name,
      exclude,
      before,
    );
  }
  if (!prev) return null;

  const stats = await db.getFirstAsync<{ v: number; c: number }>(
    `SELECT COALESCE(SUM(s.weight * s.reps), 0) as v, COUNT(*) as c
     FROM set_entries s
     WHERE s.workout_log_id = ? AND ${ghostWorkingSql()}`,
    prev.id,
  );

  return {
    logId: prev.id,
    startedAt: prev.started_at,
    durationSeconds: prev.duration_seconds,
    workingVolume: stats?.v ?? 0,
    workingSetCount: stats?.c ?? 0,
  };
}

export async function deleteWorkout(logId: number): Promise<void> {
  await discardWorkout(logId);
}

export async function clearWorkoutHistory(): Promise<void> {
  const db = await openDatabase();
  const now = Date.now();
  const logs = await db.getAllAsync<{ id: number }>(
    'SELECT id FROM workout_logs WHERE deleted_at IS NULL',
  );
  for (const log of logs) {
    await discardWorkout(log.id);
  }
  // Touch timestamp if somehow empty
  void now;
}
