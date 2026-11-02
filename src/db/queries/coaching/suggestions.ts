import { openDatabase } from '../../client';
import { getLastSetsForExercises, getRecentTopSetsForExercises, listExercises, getExercise } from '../exercises';
import { getTemplate } from '../templates';
import { suggestNextLoad } from '@/coaching/overload';
import { explainSuggestion, REASON_HISTORY_SESSIONS } from '@/coaching/reason';
import { getTodayReadiness } from '@/coaching/readiness-store';
import { collectStalledLifts, STALLED_RECENT_DAYS, type StalledLift } from '@/coaching/stalled';
import { rankSubstitutes } from '@/coaching/substitution';
import type { TrainingSuggestion } from '@/coaching/types';
import type { Exercise, SetEntry, Unit } from '../../types';
import { resolveWeightUnit } from '@/lib/units';

function workingSets(sets: SetEntry[]): { weight: number; reps: number; rpe: number | null }[] {
  return sets
    .filter((s) => s.completed && s.weight > 0 && (s.setType ?? 'working') === 'working')
    .map((s) => ({ weight: s.weight, reps: s.reps, rpe: s.rpe ?? null }));
}

/** Overload suggestions for every exercise in a template. */
/**
 * `unit` is the global display unit; `unitOverrides` (settings
 * `exerciseWeightUnits`) lets an exercise progress in its own unit's plates.
 */
export async function getTemplateSuggestions(
  templateId: number,
  unit: Unit,
  unitOverrides: Readonly<Record<string, Unit>> = {},
): Promise<TrainingSuggestion[]> {
  const template = await getTemplate(templateId);
  if (!template?.exercises?.length) return [];

  const exerciseIds = template.exercises.map((te) => te.exerciseId);
  const [lastMap, historyMap, readiness] = await Promise.all([
    getLastSetsForExercises(exerciseIds),
    getRecentTopSetsForExercises(exerciseIds, REASON_HISTORY_SESSIONS),
    getTodayReadiness(),
  ]);
  const now = Date.now();
  const out: TrainingSuggestion[] = [];

  for (const te of template.exercises) {
    const last = workingSets(lastMap[te.exerciseId] ?? []);
    const exUnit = resolveWeightUnit(unitOverrides, te.exercise?.refKey, unit);
    const suggestion = suggestNextLoad({
      exerciseId: te.exerciseId,
      exerciseName: te.exercise?.name ?? 'Exercise',
      lastWorkingSets: last,
      targetRepsMin: te.targetRepsMin,
      targetRepsMax: te.targetRepsMax,
      targetSets: te.targetSets,
      unit: exUnit,
      readiness,
    });
    if (!suggestion) continue;
    // Numbers above are final; the reason only explains them.
    suggestion.reason = explainSuggestion(suggestion, {
      lastSets: last,
      history: historyMap[te.exerciseId] ?? [],
      targetRepsMin: te.targetRepsMin,
      targetRepsMax: te.targetRepsMax,
      unit: exUnit,
      unitSource: exUnit === unit ? 'global' : 'exercise',
      readiness,
      now,
    });
    out.push(suggestion);
  }
  return out;
}

/** Single-exercise suggestion (active session assist). */
export async function getExerciseSuggestion(
  exerciseId: number,
  exerciseName: string,
  targetRepsMin: number,
  targetRepsMax: number,
  targetSets: number,
  unit: Unit,
): Promise<TrainingSuggestion | null> {
  const [lastMap, historyMap, readiness] = await Promise.all([
    getLastSetsForExercises([exerciseId]),
    getRecentTopSetsForExercises([exerciseId], REASON_HISTORY_SESSIONS),
    getTodayReadiness(),
  ]);
  const last = workingSets(lastMap[exerciseId] ?? []);
  const suggestion = suggestNextLoad({
    exerciseId,
    exerciseName,
    lastWorkingSets: last,
    targetRepsMin,
    targetRepsMax,
    targetSets,
    unit,
    readiness,
  });
  if (suggestion) {
    suggestion.reason = explainSuggestion(suggestion, {
      lastSets: last,
      history: historyMap[exerciseId] ?? [],
      targetRepsMin,
      targetRepsMax,
      unit,
      unitSource: 'global',
      readiness,
      now: Date.now(),
    });
  }
  return suggestion;
}

/** Days since each primary muscle was last trained (exposure, not medical recovery). */
export async function getMuscleExposureDays(now = Date.now()): Promise<Record<string, number>> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<{ primary_muscle: string; last_at: number }>(
    `SELECT e.primary_muscle, MAX(w.started_at) as last_at
     FROM set_entries s
     JOIN workout_logs w ON w.id = s.workout_log_id
     JOIN exercises e ON e.id = s.exercise_id
     WHERE w.ended_at IS NOT NULL AND w.deleted_at IS NULL
       AND s.deleted_at IS NULL AND s.completed = 1
       AND (s.set_type IS NULL OR s.set_type = 'working')
     GROUP BY e.primary_muscle`,
  );
  const out: Record<string, number> = {};
  for (const r of rows) {
    out[r.primary_muscle] = Math.floor((now - r.last_at) / 86_400_000);
  }
  return out;
}

/**
 * Lifts with a plateau signal for Progress. Two queries total: candidate
 * exercises (trained recently, enough sessions for the check), then one
 * batched top-set read for all of them.
 */
export async function getStalledLifts(now = Date.now()): Promise<StalledLift[]> {
  const db = await openDatabase();
  const candidates = await db.getAllAsync<{ id: number; name: string }>(
    `SELECT e.id, e.name
     FROM set_entries s
     JOIN workout_logs w ON w.id = s.workout_log_id
     JOIN exercises e ON e.id = s.exercise_id
     WHERE w.ended_at IS NOT NULL AND w.deleted_at IS NULL
       AND s.deleted_at IS NULL AND s.completed = 1 AND s.weight > 0 AND s.reps > 0
       AND (s.set_type IS NULL OR s.set_type = 'working')
     GROUP BY e.id
     HAVING COUNT(DISTINCT w.id) >= ? AND MAX(w.started_at) >= ?`,
    REASON_HISTORY_SESSIONS,
    now - STALLED_RECENT_DAYS * 86_400_000,
  );
  if (candidates.length === 0) return [];
  const names: Record<number, string> = {};
  for (const c of candidates) names[c.id] = c.name;
  const histories = await getRecentTopSetsForExercises(
    candidates.map((c) => c.id),
    REASON_HISTORY_SESSIONS,
  );
  return collectStalledLifts(histories, names, now);
}

/** Ranked local substitutes by muscle, pattern, and equipment. */
export async function getExerciseSubstitutes(exerciseId: number, limit = 6): Promise<Exercise[]> {
  const source = await getExercise(exerciseId);
  if (!source) return [];
  const all = await listExercises();
  return rankSubstitutes(source, all)
    .slice(0, limit)
    .map((s) => s.exercise);
}
