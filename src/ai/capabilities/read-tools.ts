import type { Json, ToolSpec } from '@/contracts/ai/chat';
import { CHAT_READ_TOOLS } from '@/contracts/ai/chat-tools';
import {
  clampWeeks,
  shapeExerciseHistory,
  shapePersonalRecords,
  shapeTrainingSummary,
  shapeWorkoutList,
  type NormSet,
} from '@/contracts/mcp/shape';
import {
  argLimit,
  argText,
  matchExercise,
  rankExercises,
  toUnit,
  unitLabel,
  type ExerciseCandidate,
  type Unit,
} from '@/contracts/mcp/tools';
import { openDatabase } from '@/db/client';

/**
 * The MCP read tools on device SQLite (AI-CHAT §3.4). Same names, schemas and
 * output shapes as incline-mcp (shared shapers in contracts/mcp/shape.ts).
 * Every read is batched (IN / GROUP BY), never a query per row, and results
 * are bounded top-N summaries. Weights are stored in kg; output is in the
 * user's unit.
 */
type Db = Awaited<ReturnType<typeof openDatabase>>;
type Args = Record<string, unknown>;

export class ToolInputError extends Error {}

const LOG_SCAN = 150;
const SET_SCAN = 5000;
const iso = (ms: number) => new Date(ms).toISOString();
const idArg = (args: Args, key: string): number | null => {
  const t = argText(args, key, 64);
  return t && /^\d+$/.test(t) ? Number(t) : null;
};
const ph = (n: number) => Array.from({ length: n }, () => '?').join(',');

async function unitOf(db: Db): Promise<Unit> {
  const row = await db.getFirstAsync<{ unit: string }>('SELECT unit FROM user_profile WHERE deleted_at IS NULL ORDER BY id LIMIT 1');
  return row?.unit === 'imperial' ? 'imperial' : 'metric';
}

async function secondaryFor(db: Db, ids: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (!ids.length) return out;
  const rows = await db.getAllAsync<{ exercise_id: number; muscle: string }>(
    `SELECT exercise_id, muscle FROM exercise_secondary_muscles WHERE exercise_id IN (${ph(ids.length)})`,
    ...ids,
  );
  for (const r of rows) out.set(r.exercise_id, [...(out.get(r.exercise_id) ?? []), r.muscle]);
  return out;
}

/** Recent completed sets with workout dates: one log query, one set query, one muscle query. */
async function recentSets(db: Db, sinceMs?: number): Promise<NormSet[]> {
  const logs = await db.getAllAsync<{ id: number; started_at: number }>(
    `SELECT id, started_at FROM workout_logs WHERE deleted_at IS NULL ${sinceMs ? 'AND started_at >= ?' : ''}
     ORDER BY started_at DESC LIMIT ${LOG_SCAN}`,
    ...(sinceMs ? [sinceMs] : []),
  );
  if (!logs.length) return [];
  const started = new Map(logs.map((l) => [l.id, l.started_at]));
  const rows = await db.getAllAsync<{ workout_log_id: number; exercise_id: number; weight: number; reps: number; name: string; primary_muscle: string }>(
    `SELECT s.workout_log_id, s.exercise_id, s.weight, s.reps, e.name, e.primary_muscle
     FROM set_entries s JOIN exercises e ON e.id = s.exercise_id
     WHERE s.completed = 1 AND s.deleted_at IS NULL AND s.workout_log_id IN (${ph(logs.length)})
     ORDER BY s.created_at DESC LIMIT ${SET_SCAN}`,
    ...logs.map((l) => l.id),
  );
  const secondary = await secondaryFor(db, [...new Set(rows.map((r) => r.exercise_id))]);
  return rows.map((r) => ({
    logId: String(r.workout_log_id),
    startedAt: iso(started.get(r.workout_log_id)!),
    exerciseKey: String(r.exercise_id),
    exercise: r.name,
    weightKg: r.weight,
    reps: r.reps,
    primaryMuscle: r.primary_muscle ?? null,
    secondaryMuscles: secondary.get(r.exercise_id) ?? [],
  }));
}

/** Custom exercise ids seen by `candidates`, for search's `source` field. */
const customIds = new Set<number>();

async function candidates(db: Db, ids?: number[]): Promise<ExerciseCandidate[]> {
  const where = ids ? `AND id IN (${ph(ids.length)})` : '';
  if (ids && !ids.length) return [];
  const rows = await db.getAllAsync<{ id: number; name: string; primary_muscle: string; equipment: string; is_custom: number }>(
    `SELECT id, name, primary_muscle, equipment, is_custom FROM exercises WHERE deleted_at IS NULL ${where} ORDER BY is_custom DESC, id`,
    ...(ids ?? []),
  );
  const idList = rows.map((r) => r.id);
  const aliases = new Map<number, string[]>();
  if (idList.length) {
    const a = await db.getAllAsync<{ exercise_id: number; alias: string }>(
      ids ? `SELECT exercise_id, alias FROM exercise_aliases WHERE exercise_id IN (${ph(idList.length)})` : 'SELECT exercise_id, alias FROM exercise_aliases',
      ...(ids ? idList : []),
    );
    for (const r of a) aliases.set(r.exercise_id, [...(aliases.get(r.exercise_id) ?? []), r.alias]);
  }
  const secondary = ids ? await secondaryFor(db, idList) : new Map<number, string[]>();
  for (const r of rows) if (r.is_custom) customIds.add(r.id);
  return rows.map((r) => ({
    ref: { refType: 'custom', userExerciseId: String(r.id) },
    name: r.name,
    aliases: aliases.get(r.id) ?? [],
    primaryMuscle: r.primary_muscle,
    secondaryMuscles: secondary.get(r.id) ?? [],
    equipment: r.equipment,
  }));
}

const HANDLERS: Record<string, (db: Db, args: Args) => Promise<unknown>> = {
  async get_profile(db) {
    const unit = await unitOf(db);
    const p = await db.getFirstAsync<{ name: string; goal: string; experience_level: string; bodyweight: number | null }>(
      'SELECT name, goal, experience_level, bodyweight FROM user_profile WHERE deleted_at IS NULL ORDER BY id LIMIT 1',
    );
    const bw = await db.getFirstAsync<{ weight: number; unit: string; recorded_at: number }>(
      'SELECT weight, unit, recorded_at FROM bodyweight_entries WHERE deleted_at IS NULL ORDER BY recorded_at DESC LIMIT 1',
    );
    const bwKg = bw ? (bw.unit === 'lb' ? bw.weight * 0.45359237 : bw.weight) : (p?.bodyweight ?? null);
    return {
      name: p?.name || null,
      goal: p?.goal ?? null,
      experience_level: p?.experience_level ?? null,
      unit: unitLabel(unit),
      bodyweight: bwKg ? toUnit(bwKg, unit) : null,
      bodyweight_recorded_at: bw ? iso(bw.recorded_at) : null,
    };
  },

  async list_routines(db, args) {
    const tpl = await db.getAllAsync<{ id: number; name: string; description: string; estimated_minutes: number }>(
      `SELECT id, name, description, estimated_minutes FROM workout_templates
       WHERE deleted_at IS NULL AND is_custom = 1 ORDER BY updated_at DESC LIMIT ?`,
      argLimit(args, 30),
    );
    const counts = new Map<number, number>();
    if (tpl.length) {
      const rows = await db.getAllAsync<{ template_id: number; n: number }>(
        `SELECT template_id, COUNT(*) AS n FROM template_exercises WHERE deleted_at IS NULL AND template_id IN (${ph(tpl.length)}) GROUP BY template_id`,
        ...tpl.map((t) => t.id),
      );
      for (const r of rows) counts.set(r.template_id, r.n);
    }
    return {
      routines: tpl.map((t) => ({
        id: String(t.id),
        name: t.name,
        description: t.description || undefined,
        exercises: counts.get(t.id) ?? 0,
        estimated_minutes: t.estimated_minutes,
      })),
      note: "Only the user's own routines; built-in templates are not listed.",
    };
  },

  async get_routine(db, args) {
    const id = idArg(args, 'routine_id');
    if (id === null) throw new ToolInputError('routine_id is required');
    const tpl = await db.getFirstAsync<{ id: number; name: string; description: string; estimated_minutes: number }>(
      'SELECT id, name, description, estimated_minutes FROM workout_templates WHERE id = ? AND deleted_at IS NULL',
      id,
    );
    if (!tpl) throw new ToolInputError('routine not found');
    const rows = await db.getAllAsync<{ name: string; target_sets: number; target_reps_min: number; target_reps_max: number; rest_seconds: number; notes: string }>(
      `SELECT e.name, t.target_sets, t.target_reps_min, t.target_reps_max, t.rest_seconds, t.notes
       FROM template_exercises t JOIN exercises e ON e.id = t.exercise_id
       WHERE t.template_id = ? AND t.deleted_at IS NULL ORDER BY t.sort_order`,
      id,
    );
    return {
      id: String(tpl.id),
      name: tpl.name,
      description: tpl.description,
      estimated_minutes: tpl.estimated_minutes,
      exercises: rows.map((r) => ({
        exercise: r.name,
        sets: r.target_sets,
        reps: r.target_reps_min === r.target_reps_max ? `${r.target_reps_min}` : `${r.target_reps_min}-${r.target_reps_max}`,
        rest_seconds: r.rest_seconds,
        notes: r.notes || undefined,
      })),
    };
  },

  async list_workouts(db, args) {
    const unit = await unitOf(db);
    const since = argText(args, 'since', 40);
    const sinceMs = since && !Number.isNaN(Date.parse(since)) ? Date.parse(since) : null;
    const logs = await db.getAllAsync<{ id: number; name: string; started_at: number; duration_seconds: number; total_volume: number }>(
      `SELECT id, name, started_at, duration_seconds, total_volume FROM workout_logs
       WHERE deleted_at IS NULL ${sinceMs !== null ? 'AND started_at >= ?' : ''} ORDER BY started_at DESC LIMIT ?`,
      ...(sinceMs !== null ? [sinceMs] : []),
      argLimit(args, 10),
    );
    const counts = new Map<number, number>();
    if (logs.length) {
      const rows = await db.getAllAsync<{ workout_log_id: number; n: number }>(
        `SELECT workout_log_id, COUNT(*) AS n FROM set_entries WHERE completed = 1 AND deleted_at IS NULL
         AND workout_log_id IN (${ph(logs.length)}) GROUP BY workout_log_id`,
        ...logs.map((l) => l.id),
      );
      for (const r of rows) counts.set(r.workout_log_id, r.n);
    }
    return shapeWorkoutList(
      logs.map((l) => ({
        id: String(l.id),
        name: l.name,
        startedAt: iso(l.started_at),
        durationSeconds: l.duration_seconds ?? 0,
        volumeKg: l.total_volume ?? 0,
        completedSets: counts.get(l.id) ?? 0,
      })),
      unit,
    );
  },

  async get_workout(db, args) {
    const id = idArg(args, 'workout_id');
    if (id === null) throw new ToolInputError('workout_id is required');
    const unit = await unitOf(db);
    const log = await db.getFirstAsync<{ id: number; name: string; started_at: number; duration_seconds: number; total_volume: number; notes: string }>(
      'SELECT id, name, started_at, duration_seconds, total_volume, notes FROM workout_logs WHERE id = ? AND deleted_at IS NULL',
      id,
    );
    if (!log) throw new ToolInputError('workout not found');
    const sets = await db.getAllAsync<{ exercise_id: number; name: string; weight: number; reps: number; completed: number }>(
      `SELECT s.exercise_id, e.name, s.weight, s.reps, s.completed FROM set_entries s JOIN exercises e ON e.id = s.exercise_id
       WHERE s.workout_log_id = ? AND s.deleted_at IS NULL ORDER BY s.created_at, s.set_index`,
      id,
    );
    const groups = new Map<number, { exercise: string; sets: { weight: number; reps: number; done: boolean }[] }>();
    for (const s of sets) {
      const g = groups.get(s.exercise_id) ?? { exercise: s.name, sets: [] };
      g.sets.push({ weight: toUnit(s.weight, unit), reps: s.reps, done: s.completed === 1 });
      groups.set(s.exercise_id, g);
    }
    return {
      id: String(log.id),
      name: log.name,
      date: iso(log.started_at),
      minutes: Math.round((log.duration_seconds ?? 0) / 60),
      volume: toUnit(log.total_volume ?? 0, unit),
      unit: unitLabel(unit),
      notes: log.notes || undefined,
      exercises: [...groups.values()],
    };
  },

  async get_exercise_history(db, args) {
    const query = argText(args, 'exercise', 80);
    if (!query) throw new ToolInputError('exercise is required');
    const unit = await unitOf(db);
    const sets = await recentSets(db);
    const logged = await candidates(db, [...new Set(sets.map((s) => Number(s.exerciseKey)))]);
    const hit = matchExercise(query, logged);
    if (!hit) {
      throw new ToolInputError(
        `No logged sets match "${query}". Logged exercises include: ${logged.slice(0, 15).map((c) => c.name).join(', ') || 'none'}.`,
      );
    }
    const key = hit.ref.refType === 'custom' ? hit.ref.userExerciseId : '';
    return shapeExerciseHistory(hit.name, sets.filter((s) => s.exerciseKey === key), unit, argLimit(args, 10));
  },

  async get_personal_records(db, args) {
    return shapePersonalRecords(await recentSets(db), await unitOf(db), argLimit(args, 20));
  },

  async get_training_summary(db, args) {
    const weeks = clampWeeks(args.weeks);
    const now = Date.now();
    return shapeTrainingSummary(await recentSets(db, now - weeks * 7 * 86_400_000), weeks, now);
  },

  async search_exercises(db, args) {
    const query = argText(args, 'query', 80);
    if (!query) throw new ToolInputError('query is required');
    const equipment = argText(args, 'equipment', 30)?.toLowerCase();
    let list = await candidates(db);
    if (equipment) list = list.filter((c) => c.equipment.toLowerCase() === equipment);
    const hits = rankExercises(query, list, argLimit(args, 15));
    const secondary = await secondaryFor(db, hits.map((h) => Number(h.ref.refType === 'custom' ? h.ref.userExerciseId : NaN)));
    return {
      exercises: hits.map((c) => ({
        name: c.name,
        primary_muscle: c.primaryMuscle,
        secondary_muscles: secondary.get(Number(c.ref.refType === 'custom' ? c.ref.userExerciseId : NaN)) ?? [],
        equipment: c.equipment,
        source: customIds.has(Number(c.ref.refType === 'custom' ? c.ref.userExerciseId : NaN)) ? 'custom' : 'bundled',
      })),
    };
  },
};

export interface DeviceTool {
  spec: ToolSpec;
  run(args: Json, ctx: { signal?: AbortSignal }): Promise<Json>;
}

/** The chat read tools bound to device SQLite. Unknown args → a readable error the model can repair. */
export function deviceReadTools(open: () => Promise<Db> = openDatabase): DeviceTool[] {
  return CHAT_READ_TOOLS.filter((spec) => HANDLERS[spec.name]).map((spec) => ({
    spec,
    async run(args) {
      const a = args && typeof args === 'object' && !Array.isArray(args) ? (args as Args) : {};
      const out = await HANDLERS[spec.name]!(await open(), a);
      // Drop `undefined` fields so the result is plain JSON.
      return JSON.parse(JSON.stringify(out)) as Json;
    },
  }));
}
