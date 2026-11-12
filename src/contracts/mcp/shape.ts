/**
 * Tool output shapers shared by every implementation of the read tools: the
 * MCP server (Supabase rows) and in-app chat (device SQLite). Each source
 * normalizes its rows to `NormSet` / `NormWorkout`; the numbers and field
 * names a model sees then come from one place, so an answer in Claude and an
 * answer in Ask can't drift (AI-CHAT §3A.3).
 */
import { estimate1rm, toUnit, unitLabel, weeklyMuscleSets, type Unit } from './tools';

/** One completed set, source-agnostic. Weights in kg. */
export interface NormSet {
  logId: string;
  /** ISO timestamp of the workout start. */
  startedAt: string;
  /** Stable exercise key within one source. */
  exerciseKey: string;
  exercise: string;
  weightKg: number;
  reps: number;
  primaryMuscle: string | null;
  secondaryMuscles: readonly string[];
}

export interface NormWorkout {
  id: string;
  name: string;
  startedAt: string;
  durationSeconds: number;
  volumeKg: number;
  completedSets: number;
}

export const PR_NOTE = 'Estimated 1RM uses the Epley formula on sets of 12 reps or fewer.';

export function shapePersonalRecords(sets: readonly NormSet[], unit: Unit, limit: number) {
  const best = new Map<string, { name: string; e1rm: number; e1rmDate: string; heaviest: number; heaviestReps: number; heaviestDate: string }>();
  for (const s of sets) {
    if (!(s.weightKg > 0)) continue;
    const e = estimate1rm(s.weightKg, s.reps) ?? 0;
    const cur = best.get(s.exerciseKey) ?? { name: s.exercise, e1rm: 0, e1rmDate: s.startedAt, heaviest: 0, heaviestReps: 0, heaviestDate: s.startedAt };
    if (e > cur.e1rm) Object.assign(cur, { e1rm: e, e1rmDate: s.startedAt });
    if (s.weightKg > cur.heaviest) Object.assign(cur, { heaviest: s.weightKg, heaviestReps: s.reps, heaviestDate: s.startedAt });
    best.set(s.exerciseKey, cur);
  }
  const list = [...best.values()].sort((a, b) => b.e1rm - a.e1rm).slice(0, limit);
  return {
    unit: unitLabel(unit),
    records: list.map((r) => ({
      exercise: r.name,
      estimated_1rm: r.e1rm ? toUnit(r.e1rm, unit) : null,
      estimated_1rm_date: r.e1rm ? r.e1rmDate : null,
      heaviest_set: `${toUnit(r.heaviest, unit)} x ${r.heaviestReps}`,
      heaviest_date: r.heaviestDate,
    })),
    note: PR_NOTE,
  };
}

/** `sets` already filtered to one exercise. */
export function shapeExerciseHistory(exercise: string, sets: readonly NormSet[], unit: Unit, limit: number) {
  const byLog = new Map<string, { date: string; best: { weight: number; reps: number }; e1rm: number | null; sets: number }>();
  for (const s of sets) {
    const cur = byLog.get(s.logId) ?? { date: s.startedAt, best: { weight: 0, reps: 0 }, e1rm: null, sets: 0 };
    cur.sets++;
    const e = estimate1rm(s.weightKg, s.reps);
    if (e !== null && (cur.e1rm === null || e > cur.e1rm)) cur.e1rm = e;
    if (s.weightKg > cur.best.weight || (s.weightKg === cur.best.weight && s.reps > cur.best.reps)) cur.best = { weight: s.weightKg, reps: s.reps };
    byLog.set(s.logId, cur);
  }
  const sessions = [...byLog.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
  return {
    exercise,
    unit: unitLabel(unit),
    sessions: sessions.map((s) => ({
      date: s.date,
      sets: s.sets,
      best_set: `${toUnit(s.best.weight, unit)} x ${s.best.reps}`,
      estimated_1rm: s.e1rm === null ? null : toUnit(s.e1rm, unit),
    })),
  };
}

export function shapeTrainingSummary(sets: readonly NormSet[], weeks: number, now: number) {
  const sessionWeeks = Array.from({ length: weeks }, () => new Set<string>());
  for (const s of sets) {
    const w = Math.floor((now - Date.parse(s.startedAt)) / (7 * 86_400_000));
    if (w >= 0 && w < weeks) sessionWeeks[w]!.add(s.logId);
  }
  const perMuscle = weeklyMuscleSets(
    sets.map((s) => ({ startedAt: s.startedAt, primaryMuscle: s.primaryMuscle, secondaryMuscles: [...s.secondaryMuscles] })),
    weeks,
    now,
  );
  const avg = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  return {
    weeks,
    week_order: 'index 0 = the last 7 days, 1 = the 7 days before, …',
    sessions_per_week: sessionWeeks.map((s) => s.size),
    sets_per_muscle_per_week: Object.fromEntries(
      Object.entries(perMuscle)
        .sort((a, b) => avg(b[1]) - avg(a[1]))
        .map(([m, xs]) => [m, { weekly: xs.map((x) => Math.round(x * 10) / 10), average: avg(xs) }]),
    ),
    note: 'Completed sets only. Primary muscle counts 1, each secondary 0.5.',
  };
}

export function shapeWorkoutList(workouts: readonly NormWorkout[], unit: Unit) {
  return {
    unit: unitLabel(unit),
    workouts: workouts.map((l) => ({
      id: l.id,
      name: l.name,
      date: l.startedAt,
      minutes: Math.round(l.durationSeconds / 60),
      completed_sets: l.completedSets,
      volume: toUnit(l.volumeKg, unit),
    })),
  };
}

export function clampWeeks(raw: unknown): number {
  return Math.min(12, Math.max(1, Math.round(Number(raw ?? 4)) || 4));
}
