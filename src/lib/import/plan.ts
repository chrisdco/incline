/**
 * Turn a parsed export into rows ready to insert: canonical kg, epoch ms,
 * set types, and the dedupe key. Pure; the DB write lives in
 * src/db/queries/import.ts.
 *
 * Dedupe key = start time floored to the minute + normalised workout name.
 * Minute precision because Hevy exports have no seconds and Strong's do,
 * and a round-trip through other tools can drop them; the name stops two
 * different workouts that started in the same minute from colliding. The
 * same key is applied within the file (duplicate rows) and against
 * workout_logs already in SQLite, so re-importing a file is a no-op.
 */

import { normaliseName } from './match';
import { toKg, type ImportSetType, type ParseResult } from './csv-parse';

export interface PlannedSet {
  weightKg: number;
  reps: number;
  rpe: number | null;
  setType: ImportSetType;
}

export interface PlannedExercise {
  importName: string;
  notes: string;
  sets: PlannedSet[];
}

export interface PlannedWorkout {
  key: string;
  name: string;
  startedAt: number;
  endedAt: number;
  notes: string;
  exercises: PlannedExercise[];
}

export interface ImportStats {
  workouts: number;
  sets: number;
  firstAt: number | null;
  lastAt: number | null;
}

export function dedupeKey(startedAt: number, name: string): string {
  return `${Math.floor(startedAt / 60_000)}|${normaliseName(name)}`;
}

/** Workouts in file order, kg weights, duplicate keys within the file dropped. */
export function planWorkouts(parsed: ParseResult): PlannedWorkout[] {
  const seen = new Set<string>();
  const out: PlannedWorkout[] = [];
  for (const w of parsed.workouts) {
    const startedAt = new Date(w.startIso).getTime();
    const endedAt = Math.max(startedAt, new Date(w.endIso).getTime());
    const key = dedupeKey(startedAt, w.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      name: w.title,
      startedAt,
      endedAt,
      notes: w.notes,
      exercises: w.exercises.map((e) => ({
        importName: e.name,
        notes: e.notes,
        sets: e.sets.map((s) => ({
          weightKg: toKg(Math.max(0, s.weight), parsed.fileUnit),
          reps: Math.max(0, Math.round(s.reps)),
          rpe: s.rpe,
          setType: s.setType,
        })),
      })),
    });
  }
  return out;
}

/** Drop workouts whose key already exists locally. */
export function filterExisting(
  planned: readonly PlannedWorkout[],
  existing: readonly { started_at: number; name: string }[],
): { fresh: PlannedWorkout[]; skipped: number } {
  const have = new Set(existing.map((e) => dedupeKey(e.started_at, e.name)));
  const fresh = planned.filter((p) => !have.has(p.key));
  return { fresh, skipped: planned.length - fresh.length };
}

export function importStats(planned: readonly PlannedWorkout[]): ImportStats {
  let sets = 0;
  let firstAt: number | null = null;
  let lastAt: number | null = null;
  for (const w of planned) {
    for (const e of w.exercises) sets += e.sets.length;
    firstAt = firstAt == null ? w.startedAt : Math.min(firstAt, w.startedAt);
    lastAt = lastAt == null ? w.startedAt : Math.max(lastAt, w.startedAt);
  }
  return { workouts: planned.length, sets, firstAt, lastAt };
}

/** Distinct exercise names in first-seen order. */
export function distinctExerciseNames(planned: readonly PlannedWorkout[]): string[] {
  const seen = new Set<string>();
  for (const w of planned) for (const e of w.exercises) seen.add(e.importName);
  return [...seen];
}
