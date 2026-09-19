import { openDatabase } from '../../client';
import { isSetType } from '../../types';
import {
  allTimeLeaderboard,
  celebrationEventCount,
  celebrationPrCountByLog,
  collapseRecordsByExercise,
  foldRecords,
  windowCelebrationPrs,
  type PrSetInput,
} from '@/coaching/pr';
import type { PR, PrKind } from '../../types';

export const WORKING_PR_PREDICATE = `
  s.completed = 1 AND s.deleted_at IS NULL AND s.weight > 0 AND s.reps > 0
  AND (s.set_type IS NULL OR s.set_type = 'working')
  AND w.ended_at IS NOT NULL AND w.deleted_at IS NULL
`;

interface PrSetRow {
  workoutLogId: number;
  exerciseId: number;
  exerciseName: string;
  setIndex: number;
  weight: number;
  reps: number;
  setType: string | null;
  createdAt: number;
}

function mapRow(r: PrSetRow): PrSetInput & { exerciseName: string } {
  return {
    exerciseId: r.exerciseId,
    workoutLogId: r.workoutLogId,
    setIndex: r.setIndex,
    weight: r.weight,
    reps: r.reps,
    completed: true,
    setType: isSetType(r.setType) ? r.setType : 'working',
    createdAt: r.createdAt,
    exerciseName: r.exerciseName,
  };
}

async function loadWorkingPrSets(): Promise<(PrSetInput & { exerciseName: string })[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<PrSetRow>(
    `SELECT s.workout_log_id as workoutLogId, s.exercise_id as exerciseId, e.name as exerciseName,
            s.set_index as setIndex, s.weight, s.reps, s.set_type as setType, s.created_at as createdAt
     FROM set_entries s
     JOIN workout_logs w ON w.id = s.workout_log_id
     JOIN exercises e ON e.id = s.exercise_id
     WHERE ${WORKING_PR_PREDICATE}
     ORDER BY s.created_at, s.set_index, s.id`,
  );
  return rows.map(mapRow);
}

function nameMap(rows: { exerciseId: number; exerciseName: string }[]): Map<number, string> {
  const names = new Map<number, string>();
  for (const r of rows) names.set(r.exerciseId, r.exerciseName);
  return names;
}

export async function getAllTimePrLeaderboard(): Promise<PR[]> {
  const snap = await loadPrSnapshot();
  return allTimeLeaderboard(snap.records, snap.bests, snap.names);
}

export async function getProgressPrStats(): Promise<{ prs: PR[]; prEventCount: number }> {
  const snap = await loadPrSnapshot();
  return {
    prs: allTimeLeaderboard(snap.records, snap.bests, snap.names),
    prEventCount: celebrationEventCount(snap.records),
  };
}

export async function getCelebrationPrEventCount(): Promise<number> {
  const snap = await loadPrSnapshot();
  return celebrationEventCount(snap.records);
}

export async function getCelebrationPrsInWindow(
  startMs: number,
  endMs: number,
  limit?: number,
): Promise<PR[]> {
  const snap = await loadPrSnapshot();
  const prs = windowCelebrationPrs(snap.records, startMs, endMs, snap.names);
  return limit != null ? prs.slice(0, limit) : prs;
}

export async function getPeriodPrs(startMs: number, endMs: number | null): Promise<PR[]> {
  const snap = await loadPrSnapshot();
  if (endMs == null) return allTimeLeaderboard(snap.records, snap.bests, snap.names);
  return windowCelebrationPrs(snap.records, startMs, endMs, snap.names);
}

async function loadPrSnapshot() {
  const rows = await loadWorkingPrSets();
  const folded = foldRecords(rows);
  return { ...folded, names: nameMap(rows) };
}

export type WorkoutPr = {
  exerciseId: number;
  exerciseName: string;
  weight: number;
  reps: number;
  estimated1RM: number;
  kinds: PrKind[];
};

export async function getWorkoutPrs(logId: number): Promise<WorkoutPr[]> {
  const rows = await loadWorkingPrSets();
  const { records } = foldRecords(rows);
  const names = nameMap(rows);
  return collapseRecordsByExercise(records.filter((r) => r.workoutLogId === logId))
    .map((r) => ({
      exerciseId: r.exerciseId,
      exerciseName: names.get(r.exerciseId) ?? 'Exercise',
      weight: r.weight,
      reps: r.reps,
      estimated1RM: r.estimated1RM,
      kinds: r.kinds,
    }))
    .sort((a, b) => b.weight - a.weight);
}

export async function getWorkoutPrCount(logId: number): Promise<number> {
  const prs = await getWorkoutPrs(logId);
  return prs.length;
}

export async function getCelebrationPrCounts(logIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (const id of logIds) out.set(id, 0);
  if (logIds.length === 0) return out;
  const rows = await loadWorkingPrSets();
  const { records } = foldRecords(rows);
  const counts = celebrationPrCountByLog(records);
  for (const id of logIds) out.set(id, counts.get(id) ?? 0);
  return out;
}
