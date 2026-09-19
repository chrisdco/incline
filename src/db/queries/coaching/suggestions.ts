import { openDatabase } from '../../client';
import { getLastSetsForExercises, listExercises, getExercise } from '../exercises';
import { getTemplate } from '../templates';
import { suggestNextLoad } from '@/coaching/overload';
import { getTodayReadiness } from '@/coaching/readiness-store';
import { rankSubstitutes } from '@/coaching/substitution';
import type { TrainingSuggestion } from '@/coaching/types';
import type { Exercise, SetEntry, Unit } from '../../types';

function workingSets(sets: SetEntry[]): { weight: number; reps: number; rpe: number | null }[] {
  return sets
    .filter((s) => s.completed && s.weight > 0 && (s.setType ?? 'working') === 'working')
    .map((s) => ({ weight: s.weight, reps: s.reps, rpe: s.rpe ?? null }));
}

/** Overload suggestions for every exercise in a template. */
export async function getTemplateSuggestions(
  templateId: number,
  unit: Unit,
): Promise<TrainingSuggestion[]> {
  const template = await getTemplate(templateId);
  if (!template?.exercises?.length) return [];

  const exerciseIds = template.exercises.map((te) => te.exerciseId);
  const [lastMap, readiness] = await Promise.all([
    getLastSetsForExercises(exerciseIds),
    getTodayReadiness(),
  ]);
  const out: TrainingSuggestion[] = [];

  for (const te of template.exercises) {
    const last = workingSets(lastMap[te.exerciseId] ?? []);
    const suggestion = suggestNextLoad({
      exerciseId: te.exerciseId,
      exerciseName: te.exercise?.name ?? 'Exercise',
      lastWorkingSets: last,
      targetRepsMin: te.targetRepsMin,
      targetRepsMax: te.targetRepsMax,
      targetSets: te.targetSets,
      unit,
      readiness,
    });
    if (suggestion) out.push(suggestion);
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
  const [lastMap, readiness] = await Promise.all([
    getLastSetsForExercises([exerciseId]),
    getTodayReadiness(),
  ]);
  return suggestNextLoad({
    exerciseId,
    exerciseName,
    lastWorkingSets: workingSets(lastMap[exerciseId] ?? []),
    targetRepsMin,
    targetRepsMax,
    targetSets,
    unit,
    readiness,
  });
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

/** Ranked local substitutes by muscle, pattern, and equipment. */
export async function getExerciseSubstitutes(exerciseId: number, limit = 6): Promise<Exercise[]> {
  const source = await getExercise(exerciseId);
  if (!source) return [];
  const all = await listExercises();
  return rankSubstitutes(source, all)
    .slice(0, limit)
    .map((s) => s.exercise);
}
