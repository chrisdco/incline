import { queryOptions } from '@tanstack/react-query';

import { listExercises } from '@/db/queries/exercises';
import type { SessionWorkout } from '@/db/queries/helpers';
import type { DbTable } from '@/db/write';

import { dbKey, queryClient } from './query-client';

/**
 * Table groups that lead query keys. Over-including a table only costs an
 * extra refetch; missing one leaves a screen stale, so err wide.
 */
export const TABLES = {
  catalog: [
    'exercises',
    'exercise_images',
    'exercise_aliases',
    'exercise_secondary_muscles',
    'exercise_instructions',
  ],
  logs: ['workout_logs', 'set_entries', 'exercises', 'exercise_images'],
  templates: ['workout_templates', 'template_exercises', 'exercises', 'workout_logs'],
  programs: ['programs', 'program_workouts', 'workout_templates', 'template_exercises', 'workout_logs', 'kv'],
  progress: ['workout_logs', 'set_entries', 'exercises', 'bodyweight_entries', 'body_measurements'],
  profile: ['user_profile'],
} as const satisfies Record<string, readonly DbTable[]>;

/* ---- exercise catalog (was exercise-cache.ts) ---- */

/**
 * The full catalog backing the picker: kept for the app's lifetime so every
 * open renders cached-first; any catalog-table write invalidates it.
 */
export const catalogQuery = queryOptions({
  queryKey: dbKey(TABLES.catalog, 'catalog'),
  queryFn: () => listExercises(),
  gcTime: Infinity,
});

/* ---- live session (was session-cache.ts) ---- */

export function workoutLogKey(logId: number) {
  return dbKey(TABLES.logs, 'workoutLog', logId);
}

// Long enough to survive browsing away mid-workout and coming back via the
// tray (which also re-warms it); short enough that history views don't pile up.
queryClient.setQueryDefaults(dbKey(TABLES.logs, 'workoutLog'), { gcTime: 30 * 60_000 });

/**
 * Session reopen renders these rows synchronously and revalidates behind
 * (TECH-DECISIONS §7). Entries are marked stale by every set edit but have no
 * observer while the session screen owns them, so nothing refetches per edit.
 */
export function getCachedSession(logId: number): SessionWorkout | null {
  return queryClient.getQueryData<SessionWorkout | null>(workoutLogKey(logId)) ?? null;
}

export function setCachedSession(session: SessionWorkout): void {
  queryClient.setQueryData(workoutLogKey(session.id), session);
}

export function dropCachedSession(logId: number): void {
  queryClient.removeQueries({ queryKey: workoutLogKey(logId), exact: true });
}
