import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { SEED_EXERCISES } from '../_shared/contracts/catalog/seed-exercises.ts';
import {
  argLimit,
  argText,
  catalogEquipment,
  catalogMuscle,
  estimate1rm,
  estimateRoutineMinutes,
  matchExercise,
  parseCreateRoutine,
  rankExercises,
  refKey,
  seedIdFromExternal,
  toUnit,
  unitLabel,
  weeklyMuscleSets,
  type ExerciseCandidate,
  type ExerciseRef,
  type Unit,
} from '../_shared/contracts/mcp/tools.ts';

/**
 * Tool handlers. Every query is scoped to the token's user and skips
 * soft-deleted rows; lookups are batched (`in (...)`), never per row.
 * Loads are stored in kg and reported in the user's unit.
 */
export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };
type Args = Record<string, unknown>;

interface Ctx {
  db: SupabaseClient;
  userId: string;
}

const SET_SCAN = 5000;

// ---------- exercise metadata ----------

const SEED: ExerciseCandidate[] = SEED_EXERCISES.map(([id, name, primaryMuscle, secondaryMuscles, equipment, aliases]) => ({
  ref: { refType: 'catalog', externalId: `seed:${id}` },
  name,
  aliases,
  primaryMuscle,
  secondaryMuscles,
  equipment,
}));
const SEED_BY_ID = new Map(SEED_EXERCISES.map(([id], i) => [id, SEED[i]!]));

let catalog: { rows: ExerciseCandidate[]; byId: Map<string, ExerciseCandidate>; at: number } | null = null;
const CATALOG_TTL_MS = 30 * 60_000;

/** The shared catalog (~1.3k rows, name + muscles only), cached per isolate. */
async function catalogRows(db: SupabaseClient): Promise<ExerciseCandidate[]> {
  if (catalog && Date.now() - catalog.at < CATALOG_TTL_MS) return catalog.rows;
  const rows: ExerciseCandidate[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('exercises')
      .select('external_id, name, target_muscle, secondary_muscles, equipment')
      .order('name')
      .range(from, from + 999);
    if (error || !data) break;
    for (const e of data) {
      rows.push({
        ref: { refType: 'catalog', externalId: e.external_id },
        name: e.name,
        aliases: [],
        primaryMuscle: catalogMuscle(e.target_muscle),
        secondaryMuscles: (e.secondary_muscles ?? []).map(catalogMuscle),
        equipment: catalogEquipment(e.equipment),
      });
    }
    if (data.length < 1000) break;
  }
  catalog = { rows, byId: new Map(rows.map((r) => [(r.ref as { externalId: string }).externalId, r])), at: Date.now() };
  return rows;
}

async function customRows(ctx: Ctx, ids?: string[]): Promise<ExerciseCandidate[]> {
  let q = ctx.db
    .from('user_exercises')
    .select('id, name, primary_muscle, secondary_muscles, equipment, aliases')
    .eq('user_id', ctx.userId)
    .is('deleted_at', null);
  if (ids) {
    if (ids.length === 0) return [];
    q = q.in('id', ids);
  }
  const { data } = await q.limit(1000);
  return (data ?? []).map((e) => ({
    ref: { refType: 'custom', userExerciseId: e.id },
    name: e.name,
    aliases: e.aliases ?? [],
    primaryMuscle: e.primary_muscle,
    secondaryMuscles: e.secondary_muscles ?? [],
    equipment: e.equipment,
  }));
}

interface RefCols {
  ref_type: string;
  catalog_external_id: string | null;
  user_exercise_id: string | null;
}

function rowRef(r: RefCols): ExerciseRef | null {
  if (r.ref_type === 'custom') return r.user_exercise_id ? { refType: 'custom', userExerciseId: r.user_exercise_id } : null;
  if (!r.catalog_external_id) return null;
  const seed = seedIdFromExternal(r.catalog_external_id);
  return { refType: 'catalog', externalId: seed !== null ? `seed:${seed}` : r.catalog_external_id };
}

/** Metadata for every ref in `rows`, in one batch per source. */
async function metaFor(ctx: Ctx, rows: RefCols[]): Promise<Map<string, ExerciseCandidate>> {
  const out = new Map<string, ExerciseCandidate>();
  const customIds = new Set<string>();
  let needCatalog = false;
  for (const r of rows) {
    const ref = rowRef(r);
    if (!ref) continue;
    if (ref.refType === 'custom') customIds.add(ref.userExerciseId);
    else {
      const seed = seedIdFromExternal(ref.externalId);
      if (seed !== null) {
        const hit = SEED_BY_ID.get(seed);
        if (hit) out.set(refKey(ref), hit);
      } else needCatalog = true;
    }
  }
  if (needCatalog) {
    await catalogRows(ctx.db);
    for (const r of rows) {
      const ref = rowRef(r);
      if (ref?.refType === 'catalog' && !out.has(refKey(ref))) {
        const hit = catalog!.byId.get(ref.externalId);
        if (hit) out.set(refKey(ref), hit);
      }
    }
  }
  for (const c of await customRows(ctx, [...customIds])) out.set(refKey(c.ref), c);
  return out;
}

function nameOf(meta: Map<string, ExerciseCandidate>, r: RefCols): string {
  const ref = rowRef(r);
  return (ref && meta.get(refKey(ref))?.name) ?? 'Unknown exercise';
}

// ---------- profile ----------

async function profile(ctx: Ctx): Promise<{ unit: Unit; row: Record<string, unknown> | null }> {
  const { data } = await ctx.db
    .from('profiles')
    .select('name, goal, experience_level, unit, bodyweight')
    .eq('user_id', ctx.userId)
    .is('deleted_at', null)
    .maybeSingle();
  return { unit: data?.unit === 'imperial' ? 'imperial' : 'metric', row: data };
}

async function getProfile(ctx: Ctx): Promise<ToolResult> {
  const { unit, row } = await profile(ctx);
  const { data: bw } = await ctx.db
    .from('bodyweight_entries')
    .select('weight, unit, recorded_at')
    .eq('user_id', ctx.userId)
    .is('deleted_at', null)
    .order('recorded_at', { ascending: false })
    .limit(1);
  const latest = bw?.[0];
  const bwKg = latest ? (latest.unit === 'lb' ? latest.weight * 0.45359237 : latest.weight) : (row?.bodyweight as number | null) ?? null;
  return {
    ok: true,
    data: {
      name: row?.name || null,
      goal: row?.goal ?? null,
      experience_level: row?.experience_level ?? null,
      unit: unitLabel(unit),
      bodyweight: bwKg ? toUnit(bwKg, unit) : null,
      bodyweight_recorded_at: latest?.recorded_at ?? null,
    },
  };
}

// ---------- routines ----------

async function listRoutines(ctx: Ctx, args: Args): Promise<ToolResult> {
  const { data: tpl } = await ctx.db
    .from('user_templates')
    .select('id, name, description, estimated_minutes, updated_at')
    .eq('user_id', ctx.userId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(argLimit(args, 30));
  const ids = (tpl ?? []).map((t) => t.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: rows } = await ctx.db
      .from('user_template_exercises')
      .select('template_id')
      .eq('user_id', ctx.userId)
      .is('deleted_at', null)
      .in('template_id', ids);
    for (const r of rows ?? []) counts.set(r.template_id, (counts.get(r.template_id) ?? 0) + 1);
  }
  return {
    ok: true,
    data: {
      routines: (tpl ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description || undefined,
        exercises: counts.get(t.id) ?? 0,
        estimated_minutes: t.estimated_minutes,
      })),
      note: 'Only the user\'s own routines; built-in templates are not listed.',
    },
  };
}

async function getRoutine(ctx: Ctx, args: Args): Promise<ToolResult> {
  const id = argText(args, 'routine_id', 64);
  if (!id) return { ok: false, error: 'routine_id is required' };
  const { data: tpl } = await ctx.db
    .from('user_templates')
    .select('id, name, description, estimated_minutes')
    .eq('user_id', ctx.userId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!tpl) return { ok: false, error: 'routine not found' };
  const { data: rows } = await ctx.db
    .from('user_template_exercises')
    .select('ref_type, catalog_external_id, user_exercise_id, sort_order, target_sets, target_reps_min, target_reps_max, rest_seconds, notes')
    .eq('user_id', ctx.userId)
    .eq('template_id', id)
    .is('deleted_at', null)
    .order('sort_order');
  const meta = await metaFor(ctx, rows ?? []);
  return {
    ok: true,
    data: {
      ...tpl,
      exercises: (rows ?? []).map((r) => ({
        exercise: nameOf(meta, r),
        sets: r.target_sets,
        reps: r.target_reps_min === r.target_reps_max ? `${r.target_reps_min}` : `${r.target_reps_min}-${r.target_reps_max}`,
        rest_seconds: r.rest_seconds,
        notes: r.notes || undefined,
      })),
    },
  };
}

async function createRoutine(ctx: Ctx, args: Args): Promise<ToolResult> {
  const parsed = parseCreateRoutine(args);
  if (!parsed.ok) return parsed;
  const input = parsed.value;
  // Preference on ties: the user's own exercises, then bundled, then catalog.
  const candidates = [...(await customRows(ctx)), ...SEED, ...(await catalogRows(ctx.db))];
  const matched = input.rows.map((r) => ({ row: r, hit: matchExercise(r.exercise, candidates) }));
  const missing = matched.filter((m) => !m.hit);
  if (missing.length) {
    return {
      ok: false,
      error: `No match for: ${missing
        .map((m) => {
          const near = rankExercises(m.row.exercise.split(' ').slice(-1)[0] ?? m.row.exercise, candidates, 3).map((c) => c.name);
          return `"${m.row.exercise}"${near.length ? ` (closest: ${near.join(', ')})` : ''}`;
        })
        .join('; ')}. Use search_exercises and retry with listed names. Nothing was saved.`,
    };
  }

  const now = new Date().toISOString();
  const templateId = crypto.randomUUID();
  const minutes = estimateRoutineMinutes(input.rows);
  const { error: tplError } = await ctx.db.from('user_templates').insert({
    id: templateId,
    user_id: ctx.userId,
    name: input.name,
    description: input.description,
    category: 'strength',
    difficulty: 'intermediate',
    estimated_minutes: minutes,
    created_at: now,
    updated_at: now,
  });
  if (tplError) return { ok: false, error: 'could not save the routine' };
  const { error: rowError } = await ctx.db.from('user_template_exercises').insert(
    matched.map(({ row, hit }, i) => ({
      id: crypto.randomUUID(),
      user_id: ctx.userId,
      template_id: templateId,
      ref_type: hit!.ref.refType,
      catalog_external_id: hit!.ref.refType === 'catalog' ? hit!.ref.externalId : null,
      user_exercise_id: hit!.ref.refType === 'custom' ? hit!.ref.userExerciseId : null,
      sort_order: i,
      target_sets: row.sets,
      target_reps_min: row.repsMin,
      target_reps_max: row.repsMax,
      rest_seconds: row.restSeconds,
      notes: row.notes,
      updated_at: now,
    })),
  );
  if (rowError) {
    // Don't leave an empty routine behind.
    await ctx.db.from('user_templates').update({ deleted_at: now, updated_at: now }).eq('id', templateId);
    return { ok: false, error: 'could not save the routine' };
  }
  return {
    ok: true,
    data: {
      routine_id: templateId,
      name: input.name,
      estimated_minutes: minutes,
      exercises: matched.map(({ row, hit }) => ({ requested: row.exercise, saved_as: hit!.name, sets: row.sets, reps: `${row.repsMin}-${row.repsMax}` })),
      note: 'Saved as a new routine. It appears in the Incline app after its next sync (open the app).',
    },
  };
}

// ---------- workouts ----------

interface SetRow extends RefCols {
  workout_log_id: string;
  set_index: number;
  weight: number;
  reps: number;
  completed: boolean;
  created_at: string;
}

const SET_COLS = 'workout_log_id, ref_type, catalog_external_id, user_exercise_id, set_index, weight, reps, completed, created_at';

async function listWorkouts(ctx: Ctx, args: Args): Promise<ToolResult> {
  const { unit } = await profile(ctx);
  let q = ctx.db
    .from('workout_logs')
    .select('id, name, started_at, duration_seconds, total_volume')
    .eq('user_id', ctx.userId)
    .is('deleted_at', null)
    .order('started_at', { ascending: false })
    .limit(argLimit(args, 10));
  const since = argText(args, 'since', 40);
  if (since && !Number.isNaN(Date.parse(since))) q = q.gte('started_at', new Date(since).toISOString());
  const { data: logs } = await q;
  const ids = (logs ?? []).map((l) => l.id);
  const sets = new Map<string, number>();
  if (ids.length) {
    const { data } = await ctx.db
      .from('set_entries')
      .select('workout_log_id')
      .eq('user_id', ctx.userId)
      .eq('completed', true)
      .is('deleted_at', null)
      .in('workout_log_id', ids);
    for (const s of data ?? []) sets.set(s.workout_log_id, (sets.get(s.workout_log_id) ?? 0) + 1);
  }
  return {
    ok: true,
    data: {
      unit: unitLabel(unit),
      workouts: (logs ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        date: l.started_at,
        minutes: Math.round((l.duration_seconds ?? 0) / 60),
        completed_sets: sets.get(l.id) ?? 0,
        volume: toUnit(l.total_volume ?? 0, unit),
      })),
    },
  };
}

async function getWorkout(ctx: Ctx, args: Args): Promise<ToolResult> {
  const id = argText(args, 'workout_id', 64);
  if (!id) return { ok: false, error: 'workout_id is required' };
  const { unit } = await profile(ctx);
  const { data: log } = await ctx.db
    .from('workout_logs')
    .select('id, name, started_at, duration_seconds, total_volume, notes')
    .eq('user_id', ctx.userId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!log) return { ok: false, error: 'workout not found' };
  const { data: rows } = await ctx.db
    .from('set_entries')
    .select(SET_COLS)
    .eq('user_id', ctx.userId)
    .eq('workout_log_id', id)
    .is('deleted_at', null)
    .order('created_at')
    .order('set_index');
  const meta = await metaFor(ctx, rows ?? []);
  const groups = new Map<string, { exercise: string; sets: { weight: number; reps: number; done: boolean }[] }>();
  for (const s of (rows ?? []) as SetRow[]) {
    const ref = rowRef(s);
    const key = ref ? refKey(ref) : 'unknown';
    const g = groups.get(key) ?? { exercise: nameOf(meta, s), sets: [] };
    g.sets.push({ weight: toUnit(s.weight, unit), reps: s.reps, done: s.completed });
    groups.set(key, g);
  }
  return {
    ok: true,
    data: {
      id: log.id,
      name: log.name,
      date: log.started_at,
      minutes: Math.round((log.duration_seconds ?? 0) / 60),
      volume: toUnit(log.total_volume ?? 0, unit),
      unit: unitLabel(unit),
      notes: log.notes || undefined,
      exercises: [...groups.values()],
    },
  };
}

/** Recent completed sets with their workout dates: one set query + one log query. */
async function recentSets(ctx: Ctx, sinceIso?: string): Promise<{ sets: (SetRow & { startedAt: string })[]; meta: Map<string, ExerciseCandidate> }> {
  let logsQ = ctx.db
    .from('workout_logs')
    .select('id, started_at')
    .eq('user_id', ctx.userId)
    .is('deleted_at', null)
    .order('started_at', { ascending: false })
    .limit(150);
  if (sinceIso) logsQ = logsQ.gte('started_at', sinceIso);
  const { data: logs } = await logsQ;
  const started = new Map((logs ?? []).map((l) => [l.id, l.started_at as string]));
  if (started.size === 0) return { sets: [], meta: new Map() };
  const { data: rows } = await ctx.db
    .from('set_entries')
    .select(SET_COLS)
    .eq('user_id', ctx.userId)
    .eq('completed', true)
    .is('deleted_at', null)
    .in('workout_log_id', [...started.keys()].slice(0, 150))
    .order('created_at', { ascending: false })
    .limit(SET_SCAN);
  const sets = ((rows ?? []) as SetRow[])
    .filter((s) => started.has(s.workout_log_id))
    .map((s) => ({ ...s, startedAt: started.get(s.workout_log_id)! }));
  return { sets, meta: await metaFor(ctx, sets) };
}

async function exerciseHistory(ctx: Ctx, args: Args): Promise<ToolResult> {
  const query = argText(args, 'exercise', 80);
  if (!query) return { ok: false, error: 'exercise is required' };
  const { unit } = await profile(ctx);
  const { sets, meta } = await recentSets(ctx);
  const logged = [...meta.values()];
  const hit = matchExercise(query, logged);
  if (!hit) {
    return { ok: false, error: `No logged sets match "${query}". Logged exercises include: ${logged.slice(0, 15).map((c) => c.name).join(', ') || 'none'}.` };
  }
  const key = refKey(hit.ref);
  const byLog = new Map<string, { date: string; best: { weight: number; reps: number }; e1rm: number | null; sets: number }>();
  for (const s of sets) {
    const ref = rowRef(s);
    if (!ref || refKey(ref) !== key) continue;
    const cur = byLog.get(s.workout_log_id) ?? { date: s.startedAt, best: { weight: 0, reps: 0 }, e1rm: null, sets: 0 };
    cur.sets++;
    const e = estimate1rm(s.weight, s.reps);
    if (e !== null && (cur.e1rm === null || e > cur.e1rm)) cur.e1rm = e;
    if (s.weight > cur.best.weight || (s.weight === cur.best.weight && s.reps > cur.best.reps)) cur.best = { weight: s.weight, reps: s.reps };
    byLog.set(s.workout_log_id, cur);
  }
  const sessions = [...byLog.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, argLimit(args, 10));
  return {
    ok: true,
    data: {
      exercise: hit.name,
      unit: unitLabel(unit),
      sessions: sessions.map((s) => ({
        date: s.date,
        sets: s.sets,
        best_set: `${toUnit(s.best.weight, unit)} x ${s.best.reps}`,
        estimated_1rm: s.e1rm === null ? null : toUnit(s.e1rm, unit),
      })),
    },
  };
}

async function personalRecords(ctx: Ctx, args: Args): Promise<ToolResult> {
  const { unit } = await profile(ctx);
  const { sets, meta } = await recentSets(ctx);
  const best = new Map<string, { name: string; e1rm: number; e1rmDate: string; heaviest: number; heaviestReps: number; heaviestDate: string }>();
  for (const s of sets) {
    const ref = rowRef(s);
    if (!ref || !(s.weight > 0)) continue;
    const key = refKey(ref);
    const e = estimate1rm(s.weight, s.reps) ?? 0;
    const cur = best.get(key) ?? { name: nameOf(meta, s), e1rm: 0, e1rmDate: s.startedAt, heaviest: 0, heaviestReps: 0, heaviestDate: s.startedAt };
    if (e > cur.e1rm) Object.assign(cur, { e1rm: e, e1rmDate: s.startedAt });
    if (s.weight > cur.heaviest) Object.assign(cur, { heaviest: s.weight, heaviestReps: s.reps, heaviestDate: s.startedAt });
    best.set(key, cur);
  }
  const list = [...best.values()].sort((a, b) => b.e1rm - a.e1rm).slice(0, argLimit(args, 20));
  return {
    ok: true,
    data: {
      unit: unitLabel(unit),
      records: list.map((r) => ({
        exercise: r.name,
        estimated_1rm: r.e1rm ? toUnit(r.e1rm, unit) : null,
        estimated_1rm_date: r.e1rm ? r.e1rmDate : null,
        heaviest_set: `${toUnit(r.heaviest, unit)} x ${r.heaviestReps}`,
        heaviest_date: r.heaviestDate,
      })),
      note: 'Estimated 1RM uses the Epley formula on sets of 12 reps or fewer.',
    },
  };
}

async function trainingSummary(ctx: Ctx, args: Args): Promise<ToolResult> {
  const weeks = Math.min(12, Math.max(1, Math.round(Number(args.weeks ?? 4)) || 4));
  const now = Date.now();
  const since = new Date(now - weeks * 7 * 86_400_000).toISOString();
  const { sets, meta } = await recentSets(ctx, since);
  const sessionWeeks = Array.from({ length: weeks }, () => new Set<string>());
  for (const s of sets) {
    const w = Math.floor((now - Date.parse(s.startedAt)) / (7 * 86_400_000));
    if (w >= 0 && w < weeks) sessionWeeks[w]!.add(s.workout_log_id);
  }
  const perMuscle = weeklyMuscleSets(
    sets.map((s) => {
      const ref = rowRef(s);
      const m = ref ? meta.get(refKey(ref)) : undefined;
      return { startedAt: s.startedAt, primaryMuscle: m?.primaryMuscle ?? null, secondaryMuscles: m?.secondaryMuscles ?? [] };
    }),
    weeks,
    now,
  );
  const avg = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  return {
    ok: true,
    data: {
      weeks,
      week_order: 'index 0 = the last 7 days, 1 = the 7 days before, …',
      sessions_per_week: sessionWeeks.map((s) => s.size),
      sets_per_muscle_per_week: Object.fromEntries(
        Object.entries(perMuscle)
          .sort((a, b) => avg(b[1]) - avg(a[1]))
          .map(([m, xs]) => [m, { weekly: xs.map((x) => Math.round(x * 10) / 10), average: avg(xs) }]),
      ),
      note: 'Completed sets only. Primary muscle counts 1, each secondary 0.5.',
    },
  };
}

async function searchExercises(ctx: Ctx, args: Args): Promise<ToolResult> {
  const query = argText(args, 'query', 80);
  if (!query) return { ok: false, error: 'query is required' };
  const equipment = argText(args, 'equipment', 30)?.toLowerCase();
  let candidates = [...(await customRows(ctx)), ...SEED, ...(await catalogRows(ctx.db))];
  if (equipment) candidates = candidates.filter((c) => c.equipment.toLowerCase() === equipment);
  const hits = rankExercises(query, candidates, argLimit(args, 15));
  return {
    ok: true,
    data: {
      exercises: hits.map((c) => ({
        name: c.name,
        primary_muscle: c.primaryMuscle,
        secondary_muscles: c.secondaryMuscles,
        equipment: c.equipment,
        source: c.ref.refType === 'custom' ? 'custom' : c.ref.externalId.startsWith('seed:') ? 'bundled' : 'catalog',
      })),
    },
  };
}

export const HANDLERS: Record<string, (ctx: Ctx, args: Args) => Promise<ToolResult>> = {
  get_profile: getProfile,
  list_routines: listRoutines,
  get_routine: getRoutine,
  list_workouts: listWorkouts,
  get_workout: getWorkout,
  get_exercise_history: exerciseHistory,
  get_personal_records: personalRecords,
  get_training_summary: trainingSummary,
  search_exercises: searchExercises,
  create_routine: createRoutine,
};

export const WRITE_TOOLS = new Set(['create_routine']);
