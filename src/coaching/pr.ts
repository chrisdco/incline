import { estimated1RM, setVolume } from '@/db/calc';
import type { PR, PrKind, SetType } from '@/db/types';

/** Kinds that fire session toasts, summary badges, recaps, and achievements. */
export const CELEBRATION_PR_KINDS: readonly PrKind[] = ['heaviest_weight', 'estimated_1rm'];

export function isCelebrationPrKind(kind: PrKind): boolean {
  return kind === 'heaviest_weight' || kind === 'estimated_1rm';
}

export interface PrSetInput {
  exerciseId: number;
  weight: number;
  reps: number;
  completed: boolean;
  setType?: SetType | null;
  createdAt: number;
  workoutLogId?: number;
  setIndex?: number;
}

export interface ExerciseBests {
  heaviestWeight: number;
  estimated1RM: number;
  bestSetVolume: number;
  /** Heaviest load at each rep count (rep records). */
  heaviestByReps: Record<number, number>;
}

export interface DetectedPr {
  exerciseId: number;
  workoutLogId?: number;
  kinds: PrKind[];
  weight: number;
  reps: number;
  estimated1RM: number;
  setVolume: number;
  createdAt: number;
}

export function emptyExerciseBests(): ExerciseBests {
  return { heaviestWeight: 0, estimated1RM: 0, bestSetVolume: 0, heaviestByReps: {} };
}

export function hasPriorPrHistory(bests: ExerciseBests): boolean {
  return bests.heaviestWeight > 0 || bests.estimated1RM > 0;
}

export function bestsFromPrSummary(pr: {
  heaviestWeight: number;
  best1RM: number;
  bestSetVolume?: number;
}): ExerciseBests {
  return {
    heaviestWeight: pr.heaviestWeight,
    estimated1RM: pr.best1RM,
    bestSetVolume: pr.bestSetVolume ?? 0,
    heaviestByReps: {},
  };
}

export function isEligiblePrSet(set: PrSetInput): boolean {
  return (
    set.completed
    && (set.setType ?? 'working') === 'working'
    && set.weight > 0
    && set.reps > 0
  );
}

export function detectSetRecords(
  set: PrSetInput,
  prior: ExerciseBests,
  opts?: { requirePriorHistory?: boolean },
): PrKind[] {
  if (!isEligiblePrSet(set)) return [];
  if (opts?.requirePriorHistory && !hasPriorPrHistory(prior)) return [];

  const kinds: PrKind[] = [];
  if (set.weight > prior.heaviestWeight) kinds.push('heaviest_weight');
  const e1rm = estimated1RM(set.weight, set.reps);
  if (e1rm > prior.estimated1RM) kinds.push('estimated_1rm');
  if (set.weight > (prior.heaviestByReps[set.reps] ?? 0)) kinds.push('rep_record');
  if (setVolume(set.weight, set.reps) > prior.bestSetVolume) kinds.push('volume_record');
  return kinds;
}

export function applySetToBests(prior: ExerciseBests, set: PrSetInput): ExerciseBests {
  if (!isEligiblePrSet(set)) return prior;
  const e1rm = estimated1RM(set.weight, set.reps);
  const vol = setVolume(set.weight, set.reps);
  const heaviestByReps = { ...prior.heaviestByReps };
  if (set.weight > (heaviestByReps[set.reps] ?? 0)) heaviestByReps[set.reps] = set.weight;
  return {
    heaviestWeight: Math.max(prior.heaviestWeight, set.weight),
    estimated1RM: Math.max(prior.estimated1RM, e1rm),
    bestSetVolume: Math.max(prior.bestSetVolume, vol),
    heaviestByReps,
  };
}

function sortPrSets(sets: PrSetInput[]): PrSetInput[] {
  return [...sets].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    const ai = a.setIndex ?? 0;
    const bi = b.setIndex ?? 0;
    if (ai !== bi) return ai - bi;
    return (a.workoutLogId ?? 0) - (b.workoutLogId ?? 0);
  });
}

/** Walk sets in time order and emit every strict record. */
export function foldRecords(sets: PrSetInput[]): { records: DetectedPr[]; bests: Map<number, ExerciseBests> } {
  const bests = new Map<number, ExerciseBests>();
  const records: DetectedPr[] = [];
  for (const set of sortPrSets(sets)) {
    if (!isEligiblePrSet(set)) continue;
    const prior = bests.get(set.exerciseId) ?? emptyExerciseBests();
    const kinds = detectSetRecords(set, prior);
    if (kinds.length > 0) {
      records.push({
        exerciseId: set.exerciseId,
        workoutLogId: set.workoutLogId,
        kinds,
        weight: set.weight,
        reps: set.reps,
        estimated1RM: estimated1RM(set.weight, set.reps),
        setVolume: setVolume(set.weight, set.reps),
        createdAt: set.createdAt,
      });
    }
    bests.set(set.exerciseId, applySetToBests(prior, set));
  }
  return { records, bests };
}

export function celebrationKindsOf(kinds: PrKind[]): PrKind[] {
  return kinds.filter(isCelebrationPrKind);
}

/** One row per exercise; union of celebration kinds; prefer a heaviest-weight set. */
export function collapseRecordsByExercise(
  records: DetectedPr[],
  kinds: readonly PrKind[] = CELEBRATION_PR_KINDS,
): DetectedPr[] {
  const map = new Map<number, DetectedPr>();
  for (const r of records) {
    const matched = r.kinds.filter((k) => kinds.includes(k));
    if (matched.length === 0) continue;
    const prev = map.get(r.exerciseId);
    if (!prev) {
      map.set(r.exerciseId, { ...r, kinds: matched });
      continue;
    }
    const union = [...new Set([...prev.kinds, ...matched])];
    const preferNew =
      (matched.includes('heaviest_weight') && !prev.kinds.includes('heaviest_weight'))
      || r.createdAt >= prev.createdAt;
    map.set(r.exerciseId, {
      ...(preferNew ? r : prev),
      kinds: union,
    });
  }
  return [...map.values()];
}

/** Unique exercise count per finished session for celebration PRs. */
export function celebrationPrCountByLog(records: DetectedPr[]): Map<number, number> {
  const byLog = new Map<number, Set<number>>();
  for (const r of records) {
    if (r.workoutLogId == null) continue;
    if (!r.kinds.some(isCelebrationPrKind)) continue;
    let ids = byLog.get(r.workoutLogId);
    if (!ids) {
      ids = new Set();
      byLog.set(r.workoutLogId, ids);
    }
    ids.add(r.exerciseId);
  }
  const out = new Map<number, number>();
  for (const [logId, ids] of byLog) out.set(logId, ids.size);
  return out;
}

export function celebrationEventCount(records: DetectedPr[]): number {
  const keys = new Set<string>();
  for (const r of records) {
    if (!r.kinds.some(isCelebrationPrKind)) continue;
    keys.add(`${r.workoutLogId ?? 0}:${r.exerciseId}`);
  }
  return keys.size;
}

export function prKindLabel(kind: PrKind, reps?: number): string {
  switch (kind) {
    case 'heaviest_weight':
      return 'Heaviest';
    case 'estimated_1rm':
      return 'e1RM';
    case 'rep_record':
      return reps != null && reps > 0 ? `${reps}RM` : 'Rep record';
    case 'volume_record':
      return 'Set volume';
  }
}

export function formatCelebrationKinds(kinds: PrKind[], reps?: number): string {
  const show = celebrationKindsOf(kinds);
  const labels = (show.length > 0 ? show : kinds).map((k) => prKindLabel(k, reps));
  return [...new Set(labels)].join(' · ');
}

function nameOf(id: number, names: Map<number, string> | Record<number, string>): string {
  if (names instanceof Map) return names.get(id) ?? 'Exercise';
  return names[id] ?? 'Exercise';
}

export function allTimeLeaderboard(
  records: DetectedPr[],
  bests: Map<number, ExerciseBests>,
  names: Map<number, string> | Record<number, string>,
): PR[] {
  const out: PR[] = [];
  for (const [exerciseId, b] of bests) {
    if (b.heaviestWeight <= 0 && b.estimated1RM <= 0) continue;
    const exRecords = records.filter((r) => r.exerciseId === exerciseId);
    const heavy = [...exRecords].reverse().find((r) => r.kinds.includes('heaviest_weight'));
    const e1 = [...exRecords].reverse().find((r) => r.kinds.includes('estimated_1rm'));
    const display = e1 ?? heavy ?? exRecords.at(-1);
    out.push({
      exerciseId,
      exerciseName: nameOf(exerciseId, names),
      maxWeight: b.heaviestWeight,
      maxReps: display?.reps ?? 0,
      estimated1RM: b.estimated1RM,
      bestSetVolume: b.bestSetVolume,
      achievedAt: Math.max(heavy?.createdAt ?? 0, e1?.createdAt ?? 0),
    });
  }
  return out.sort((a, b) => b.estimated1RM - a.estimated1RM);
}

export function windowCelebrationPrs(
  records: DetectedPr[],
  startMs: number,
  endMs: number,
  names: Map<number, string> | Record<number, string>,
): PR[] {
  const inWindow = records.filter(
    (r) => r.createdAt >= startMs && r.createdAt < endMs && r.kinds.some(isCelebrationPrKind),
  );
  return collapseRecordsByExercise(inWindow)
    .map((r) => ({
      exerciseId: r.exerciseId,
      exerciseName: nameOf(r.exerciseId, names),
      maxWeight: r.weight,
      maxReps: r.reps,
      estimated1RM: r.estimated1RM,
      bestSetVolume: r.setVolume,
      achievedAt: r.createdAt,
      kinds: r.kinds,
    }))
    .sort((a, b) => b.estimated1RM - a.estimated1RM);
}
