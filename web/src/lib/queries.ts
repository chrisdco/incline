import { revalidatePath } from "next/cache";

import { supabaseForUser } from "./supabase";
import { toDisplayWeight, weekStart } from "./format";
import type {
  BodyweightRow,
  CatalogExerciseRow,
  CustomExerciseRow,
  MeasurementRow,
  ProfileRow,
  ProgramRow,
  ProgramSlotRow,
  ResolvedExercise,
  RoutineExerciseRow,
  RoutineRow,
  SetEntryRow,
  WorkoutLogRow,
} from "./types";

const NOT_DELETED = "deleted_at.is.null";

async function authed() {
  return supabaseForUser();
}

export async function getProfile(): Promise<ProfileRow | null> {
  const { supabase, userId } = await authed();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

export async function updateProfileAction(formData: FormData): Promise<void> {
  "use server";
  const { supabase, userId } = await authed();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const goal = String(formData.get("goal") ?? "build_muscle");
  const unit = String(formData.get("unit") ?? "metric");
  if (!name) throw new Error("Name is required");
  if (!["build_muscle", "gain_strength", "lose_fat", "improve_endurance"].includes(goal)) {
    throw new Error("Invalid goal");
  }
  if (unit !== "metric" && unit !== "imperial") throw new Error("Invalid unit");
  const { error } = await supabase
    .from("profiles")
    .update({ name, goal, unit, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  revalidatePath("/");
}

/** Batch-resolve set/routine refs to display names (one query per origin). */
export async function resolveExercises(
  refs: { ref_type: string; catalog_external_id: string | null; user_exercise_id: string | null }[],
): Promise<Map<string, ResolvedExercise>> {
  const { supabase, userId } = await authed();
  const out = new Map<string, ResolvedExercise>();
  const catalogIds = [...new Set(refs.filter((r) => r.ref_type === "catalog" && r.catalog_external_id).map((r) => r.catalog_external_id as string))];
  const customIds = [...new Set(refs.filter((r) => r.ref_type === "custom" && r.user_exercise_id).map((r) => r.user_exercise_id as string))];
  const [catalogRes, customRes] = await Promise.all([
    catalogIds.length > 0
      ? supabase.from("exercises").select("*").in("external_id", catalogIds)
      : Promise.resolve({ data: [] as CatalogExerciseRow[] }),
    customIds.length > 0
      ? supabase.from("user_exercises").select("*").in("id", customIds).eq("user_id", userId).is("deleted_at", null)
      : Promise.resolve({ data: [] as CustomExerciseRow[] }),
  ]);
  const { data: catalogData } = catalogRes;
  for (const row of ((catalogData ?? []) as CatalogExerciseRow[])) {
    out.set(`catalog:${row.external_id}`, {
      key: `catalog:${row.external_id}`,
      name: row.name,
      muscle: row.target_muscle,
      equipment: row.equipment,
      custom: false,
    });
  }
  const { data: customData } = customRes;
  for (const row of ((customData ?? []) as CustomExerciseRow[])) {
    out.set(`custom:${row.id}`, {
      key: `custom:${row.id}`,
      name: row.name,
      muscle: row.primary_muscle,
      equipment: row.equipment,
      custom: true,
    });
  }
  return out;
}

export interface DashboardData {
  profile: ProfileRow | null;
  totalSessions: number;
  totalVolume: number;
  weekSessions: number;
  weekVolume: number;
  streakWeeks: number;
  lastWorkout: WorkoutLogRow | null;
  recent: WorkoutLogRow[];
}

export async function getDashboard(): Promise<DashboardData> {
  const { supabase, userId } = await authed();
  const [profile, logsRes] = await Promise.all([
    getProfile(),
    supabase
      .from("workout_logs")
      .select("id,name,started_at,ended_at,duration_seconds,total_volume,unit,notes,template_id,user_id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(400),
  ]);
  const logs = (logsRes.data ?? []) as (WorkoutLogRow & { unit: string })[];
  const displayUnit = profile?.unit ?? "metric";
  const vol = (l: { total_volume: number; unit: string }) =>
    toDisplayWeight(l.total_volume ?? 0, l.unit, displayUnit);
  const totalSessions = logs.length;
  const totalVolume = logs.reduce((a, l) => a + vol(l), 0);
  const ws = weekStart().getTime();
  const thisWeek = logs.filter((l) => new Date(l.started_at).getTime() >= ws);
  // Consecutive Monday-weeks with at least one session.
  let streakWeeks = 0;
  const cursor = new Date(ws);
  const weeks = new Set(
    logs.map((l) => {
      const d = new Date(l.started_at);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return d.getTime();
    }),
  );
  for (;;) {
    if (weeks.has(cursor.getTime())) {
      streakWeeks += 1;
      cursor.setDate(cursor.getDate() - 7);
    } else if (streakWeeks === 0) {
      cursor.setDate(cursor.getDate() - 7);
      if (!weeks.has(cursor.getTime())) break;
      streakWeeks += 1;
      cursor.setDate(cursor.getDate() - 7);
    } else break;
    if (streakWeeks > 520) break;
  }
  return {
    profile,
    totalSessions,
    totalVolume,
    weekSessions: thisWeek.length,
    weekVolume: thisWeek.reduce((a, l) => a + vol(l), 0),
    streakWeeks,
    lastWorkout: logs[0] ?? null,
    recent: logs.slice(0, 5),
  };
}

/**
 * Page of finished workouts, newest first. PostgREST .range() is inclusive on
 * both ends, so fetching pageSize+1 rows is the *only* +1 in this path —
 * callers must not add their own.
 */
export async function getWorkouts(pageSize = 20, offset = 0): Promise<{ logs: WorkoutLogRow[]; hasMore: boolean }> {
  const { supabase, userId } = await authed();
  const { data } = await supabase
    .from("workout_logs")
    .select("id,name,started_at,ended_at,duration_seconds,total_volume,unit,notes,template_id,user_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .range(offset, offset + pageSize);
  const logs = (data ?? []) as WorkoutLogRow[];
  return { logs: logs.slice(0, pageSize), hasMore: logs.length > pageSize };
}

export async function getWorkout(id: string): Promise<{ log: WorkoutLogRow; sets: SetEntryRow[]; names: Map<string, ResolvedExercise> } | null> {
  const { supabase, userId } = await authed();
  const [logRes, setsRes] = await Promise.all([
    supabase
      .from("workout_logs")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("set_entries")
      .select("*")
      .eq("workout_log_id", id)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("set_index", { ascending: true }),
  ]);
  const log = logRes.data;
  if (!log) return null;
  const setRows = (setsRes.data ?? []) as SetEntryRow[];
  const names = await resolveExercises(setRows);
  return { log: log as WorkoutLogRow, sets: setRows, names };
}

export async function getRoutines(): Promise<RoutineRow[]> {
  const { supabase, userId } = await authed();
  const { data } = await supabase
    .from("user_templates")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("name");
  return (data ?? []) as RoutineRow[];
}

export async function getRoutine(id: string): Promise<{ routine: RoutineRow; exercises: RoutineExerciseRow[]; names: Map<string, ResolvedExercise> } | null> {
  const { supabase, userId } = await authed();
  const [routineRes, exercisesRes] = await Promise.all([
    supabase
      .from("user_templates")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("user_template_exercises")
      .select("*")
      .eq("template_id", id)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("sort_order"),
  ]);
  const routine = routineRes.data;
  if (!routine) return null;
  const rows = (exercisesRes.data ?? []) as RoutineExerciseRow[];
  const names = await resolveExercises(rows);
  return { routine: routine as RoutineRow, exercises: rows, names };
}

export async function getPrograms(): Promise<ProgramRow[]> {
  const { supabase, userId } = await authed();
  const { data } = await supabase.from("user_programs").select("*").eq("user_id", userId).is("deleted_at", null).order("name");
  return (data ?? []) as ProgramRow[];
}

export async function getProgram(id: string): Promise<{ program: ProgramRow; slots: ProgramSlotRow[]; routineNames: Map<string, string> } | null> {
  const { supabase, userId } = await authed();
  const [programRes, slotsRes] = await Promise.all([
    supabase.from("user_programs").select("*").eq("id", id).eq("user_id", userId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("user_program_workouts")
      .select("*")
      .eq("program_id", id)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("week")
      .order("day")
      .order("sort_order"),
  ]);
  const program = programRes.data;
  if (!program) return null;
  const slotRows = (slotsRes.data ?? []) as ProgramSlotRow[];
  const routineIds = [...new Set(slotRows.filter((s) => s.user_template_id).map((s) => s.user_template_id as string))];
  const routineNames = new Map<string, string>();
  if (routineIds.length > 0) {
    const { data: routines } = await supabase.from("user_templates").select("id,name").in("id", routineIds).eq("user_id", userId);
    for (const r of (routines ?? []) as { id: string; name: string }[]) routineNames.set(r.id, r.name);
  }
  return { program: program as ProgramRow, slots: slotRows, routineNames };
}

export async function searchExercises(query: string, muscle: string): Promise<{ catalog: CatalogExerciseRow[]; custom: CustomExerciseRow[] }> {
  const { supabase, userId } = await authed();
  const q = query.trim();
  let catalogQuery = supabase.from("exercises").select("*").order("name").limit(100);
  if (q) catalogQuery = catalogQuery.ilike("name", `%${q}%`);
  if (muscle) catalogQuery = catalogQuery.eq("target_muscle", muscle);
  let customQuery = supabase.from("user_exercises").select("*").eq("user_id", userId).is("deleted_at", null).order("name").limit(100);
  if (q) customQuery = customQuery.ilike("name", `%${q}%`);
  if (muscle) customQuery = customQuery.eq("primary_muscle", muscle);
  const [catalogRes, customRes] = await Promise.all([catalogQuery, customQuery]);
  return {
    catalog: (catalogRes.data ?? []) as CatalogExerciseRow[],
    custom: (customRes.data ?? []) as CustomExerciseRow[],
  };
}

export async function getCatalogExercise(externalId: string): Promise<CatalogExerciseRow | null> {
  const { supabase } = await authed();
  const { data } = await supabase.from("exercises").select("*").eq("external_id", externalId).maybeSingle();
  return (data as CatalogExerciseRow | null) ?? null;
}

export async function getCustomExercise(id: string): Promise<CustomExerciseRow | null> {
  const { supabase, userId } = await authed();
  const { data } = await supabase.from("user_exercises").select("*").eq("id", id).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  return (data as CustomExerciseRow | null) ?? null;
}

export interface ExerciseHistoryPoint {
  logId: string;
  logName: string;
  startedAt: string;
  weight: number;
  reps: number;
  volume: number;
  oneRm: number;
}

export async function getExerciseHistory(
  ref: { ref_type: string; catalog_external_id?: string; custom_id?: string },
  limit = 60,
): Promise<ExerciseHistoryPoint[]> {
  const { supabase, userId } = await authed();
  let setQuery = supabase
    .from("set_entries")
    .select("workout_log_id,weight,reps,completed,set_type")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("completed", true)
    .order("created_at", { ascending: false })
    .limit(limit * 4);
  if (ref.ref_type === "catalog") setQuery = setQuery.eq("ref_type", "catalog").eq("catalog_external_id", ref.catalog_external_id ?? "");
  else setQuery = setQuery.eq("ref_type", "custom").eq("user_exercise_id", ref.custom_id ?? "");
  const { data: sets } = await setQuery;
  const logIds = [...new Set(((sets ?? []) as { workout_log_id: string }[]).map((s) => s.workout_log_id))].slice(0, limit);
  if (logIds.length === 0) return [];
  const { data: logs } = await supabase.from("workout_logs").select("id,name,started_at").in("id", logIds).eq("user_id", userId);
  const logById = new Map(((logs ?? []) as { id: string; name: string; started_at: string }[]).map((l) => [l.id, l]));
  const points: ExerciseHistoryPoint[] = [];
  for (const s of (sets ?? []) as { workout_log_id: string; weight: number; reps: number; set_type: string }[]) {
    if (s.set_type !== "working") continue;
    const log = logById.get(s.workout_log_id);
    if (!log) continue;
    points.push({
      logId: log.id,
      logName: log.name,
      startedAt: log.started_at,
      weight: s.weight,
      reps: s.reps,
      volume: s.weight * s.reps,
      oneRm: s.reps <= 1 ? s.weight : s.weight * (1 + s.reps / 30),
    });
  }
  return points.sort((a, b) => +new Date(a.startedAt) - +new Date(b.startedAt)).slice(-limit);
}

export interface WeekBucket {
  weekStart: string;
  sessions: number;
  volume: number;
}

export interface TwoWeekData {
  week: WorkoutLogRow[];
  prev: WorkoutLogRow[];
  sets: SetEntryRow[];
  displayUnit: string;
}

/** Week vs previous-week logs plus their completed sets in two queries. */
export async function getTwoWeekData(): Promise<TwoWeekData> {
  const { supabase, userId } = await authed();
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const [{ data: profile }, { data: logs }] = await Promise.all([
    supabase.from("profiles").select("unit").eq("user_id", userId).maybeSingle(),
    supabase
      .from("workout_logs")
      .select("id,name,started_at,ended_at,duration_seconds,total_volume,unit,notes,template_id,user_id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .not("ended_at", "is", null)
      .gte("started_at", since.toISOString())
      .order("started_at", { ascending: false })
      .limit(60),
  ]);
  const displayUnit = ((profile as { unit: string } | null)?.unit ?? "metric");
  const rows = (logs ?? []) as WorkoutLogRow[];
  const ws = weekStart().getTime();
  const week = rows.filter((l) => new Date(l.started_at).getTime() >= ws);
  const prev = rows.filter((l) => new Date(l.started_at).getTime() < ws);
  const ids = rows.map((l) => l.id);
  let sets: SetEntryRow[] = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from("set_entries")
      .select("id,workout_log_id,weight,reps,completed,set_type")
      .in("workout_log_id", ids)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .eq("completed", true)
      .limit(5000);
    sets = (data ?? []) as SetEntryRow[];
  }
  return { week, prev, sets, displayUnit };
}

export async function getVolumeSeries(weeks = 12): Promise<WeekBucket[]> {
  const { supabase, userId } = await authed();
  const since = new Date();
  since.setDate(since.getDate() - weeks * 7);
  const [{ data: profile }, { data }] = await Promise.all([
    supabase.from("profiles").select("unit").eq("user_id", userId).maybeSingle(),
    supabase
      .from("workout_logs")
      .select("started_at,total_volume,unit")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .not("ended_at", "is", null)
      .gte("started_at", since.toISOString())
      .order("started_at", { ascending: true }),
  ]);
  const displayUnit = ((profile as { unit: string } | null)?.unit ?? "metric");
  const buckets = new Map<string, WeekBucket>();
  for (const l of (data ?? []) as { started_at: string; total_volume: number; unit: string }[]) {
    const d = new Date(l.started_at);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = d.toISOString().slice(0, 10);
    const b = buckets.get(key) ?? { weekStart: key, sessions: 0, volume: 0 };
    b.sessions += 1;
    b.volume += toDisplayWeight(l.total_volume ?? 0, l.unit, displayUnit);
    buckets.set(key, b);
  }
  return [...buckets.values()];
}

export async function getBodyweight(limit = 200): Promise<BodyweightRow[]> {
  const { supabase, userId } = await authed();
  const { data } = await supabase
    .from("bodyweight_entries")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("recorded_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as BodyweightRow[];
}

export async function getMeasurements(metric: string, limit = 200): Promise<MeasurementRow[]> {
  const { supabase, userId } = await authed();
  let q = supabase.from("body_measurements").select("*").eq("user_id", userId).is("deleted_at", null).order("recorded_at", { ascending: true }).limit(limit);
  if (metric) q = q.eq("metric", metric);
  const { data } = await q;
  return (data ?? []) as MeasurementRow[];
}

export async function getMeasurementMetrics(): Promise<string[]> {
  const { supabase, userId } = await authed();
  const { data } = await supabase.from("body_measurements").select("metric").eq("user_id", userId).is("deleted_at", null).limit(1000);
  return [...new Set(((data ?? []) as { metric: string }[]).map((r) => r.metric))];
}

export async function getPrefs(): Promise<Record<string, unknown>> {
  const { supabase, userId } = await authed();
  const { data } = await supabase.from("user_preferences").select("payload").eq("user_id", userId).maybeSingle();
  return ((data as { payload: Record<string, unknown> } | null)?.payload ?? {}) as Record<string, unknown>;
}

export interface MuscleSlice {
  muscle: string;
  sets: number;
  volume: number;
}

/** Completed working sets grouped by primary muscle (catalog + custom resolved in batches). */
export async function getMuscleSplit(days = 30): Promise<MuscleSlice[]> {
  const { supabase, userId } = await authed();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data: sets } = await supabase
    .from("set_entries")
    .select("ref_type,catalog_external_id,user_exercise_id,weight,reps")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("completed", true)
    .eq("set_type", "working")
    .gt("weight", 0)
    .gte("created_at", since.toISOString())
    .limit(5000);
  const rows = (sets ?? []) as { ref_type: string; catalog_external_id: string | null; user_exercise_id: string | null; weight: number; reps: number }[];
  const names = await resolveExercises(rows);
  const byMuscle = new Map<string, MuscleSlice>();
  for (const s of rows) {
    const key = `${s.ref_type}:${s.ref_type === "catalog" ? s.catalog_external_id : s.user_exercise_id}`;
    const muscle = names.get(key)?.muscle ?? "other";
    const slice = byMuscle.get(muscle) ?? { muscle, sets: 0, volume: 0 };
    slice.sets += 1;
    slice.volume += s.weight * s.reps;
    byMuscle.set(muscle, slice);
  }
  return [...byMuscle.values()].sort((a, b) => b.sets - a.sets);
}

export interface RecordRow {
  key: string;
  name: string;
  muscle: string;
  heaviest: number;
  bestE1rm: number;
  sets: number;
}

/** All-time bests per exercise from completed working sets (bounded scan). */
export async function getRecords(displayUnit: string): Promise<RecordRow[]> {
  const { supabase, userId } = await authed();
  const { data: sets } = await supabase
    .from("set_entries")
    .select("workout_log_id,ref_type,catalog_external_id,user_exercise_id,weight,reps")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("completed", true)
    .eq("set_type", "working")
    .gt("weight", 0)
    .order("created_at", { ascending: false })
    .limit(5000);
  const rows = (sets ?? []) as { workout_log_id: string; ref_type: string; catalog_external_id: string | null; user_exercise_id: string | null; weight: number; reps: number }[];
  const logIds = [...new Set(rows.map((r) => r.workout_log_id))];
  const unitByLog = new Map<string, string>();
  // Chunked parallel: one round trip instead of one per 200 ids.
  const logChunks: string[][] = [];
  for (let i = 0; i < logIds.length; i += 200) logChunks.push(logIds.slice(i, i + 200));
  const logResults = await Promise.all(
    logChunks.map((chunk) =>
      supabase.from("workout_logs").select("id,unit").in("id", chunk).eq("user_id", userId),
    ),
  );
  for (const res of logResults) {
    for (const l of (res.data ?? []) as { id: string; unit: string }[]) unitByLog.set(l.id, l.unit);
  }
  const names = await resolveExercises(rows);
  const byKey = new Map<string, RecordRow>();
  for (const s of rows) {
    const key = `${s.ref_type}:${s.ref_type === "catalog" ? s.catalog_external_id : s.user_exercise_id}`;
    const resolved = names.get(key);
    if (!resolved) continue;
    const weight = toDisplayWeight(s.weight, unitByLog.get(s.workout_log_id) ?? displayUnit, displayUnit);
    const e1rm = s.reps <= 1 ? weight : weight * (1 + s.reps / 30);
    const cur = byKey.get(key) ?? { key, name: resolved.name, muscle: resolved.muscle, heaviest: 0, bestE1rm: 0, sets: 0 };
    cur.heaviest = Math.max(cur.heaviest, weight);
    cur.bestE1rm = Math.max(cur.bestE1rm, e1rm);
    cur.sets += 1;
    byKey.set(key, cur);
  }
  return [...byKey.values()].sort((a, b) => b.bestE1rm - a.bestE1rm);
}

/** Local-day training markers for the calendar heatmap. */
export async function getTrainingDays(year: number): Promise<Map<string, number>> {
  const { supabase, userId } = await authed();
  const { data } = await supabase
    .from("workout_logs")
    .select("started_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .not("ended_at", "is", null)
    .gte("started_at", `${year}-01-01`)
    .lt("started_at", `${year + 1}-01-01`)
    .limit(2000);
  const days = new Map<string, number>();
  for (const l of (data ?? []) as { started_at: string }[]) {
    const d = new Date(l.started_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    days.set(key, (days.get(key) ?? 0) + 1);
  }
  return days;
}

export { NOT_DELETED };
