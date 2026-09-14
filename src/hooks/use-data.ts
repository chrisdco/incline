import { useCallback, useEffect, useRef, useState } from 'react';

import { useAsync } from './use-async';
import {
  getActiveWorkout,
  getExercise,
  getExerciseHistory,
  getProgram,
  getProfile,
  getPeriodStats,
  getProgressStats,
  getSuggestedTemplate,
  getTemplate,
  getTodayProgramSlot,
  getWeeklyRecap,
  getMonthlyRecap,
  getWorkoutLog,
  listExercises,
  listPrograms,
  listTemplateSummaries,
  listWorkoutLogs,
  listWorkoutFeedLogs,
  searchExercises,
  type ExerciseFilters,
  type SessionWorkout,
  type TodayProgramSlot,
  type WorkoutLogFilters,
} from '@/db/queries';
import type { Exercise, FeedWorkoutLog, MuscleGroup, MonthlyRecap, PR, PeriodStats, ProgressRange, Program, ProgressStats, SearchHit, UserProfile, WeeklyRecap, WorkoutLog, WorkoutTemplate } from '@/db/types';
import { useSettings } from '@/store/settings-store';

/* ---- catalog ---- */
export function useExercises() {
  return useAsync<Exercise[]>(() => listExercises(), []);
}
export function useExercise(id: number) {
  return useAsync<Exercise | null>(() => getExercise(id), [id]);
}
export function useSearchExercises(query: string, filters?: ExerciseFilters) {
  return useAsync<SearchHit[]>(
    () => searchExercises(query, filters),
    [query, filters?.muscle, filters?.equipment, filters?.pattern],
  );
}
export function useExerciseHistory(exerciseId: number) {
  return useAsync(() => getExerciseHistory(exerciseId), [exerciseId]);
}

/* ---- templates & programs ---- */
export function useTemplateSummaries() {
  return useAsync(() => listTemplateSummaries(), []);
}
export function useTemplate(id: number) {
  return useAsync<WorkoutTemplate | null>(() => getTemplate(id), [id]);
}
export function useSuggestedTemplate() {
  return useAsync<WorkoutTemplate | null>(() => getSuggestedTemplate(), []);
}
export function usePrograms() {
  return useAsync<Program[]>(() => listPrograms(), []);
}
export function useProgram(id: number) {
  return useAsync<Program | null>(() => getProgram(id), [id]);
}
export function useTodayProgramSlot() {
  return useAsync<TodayProgramSlot | null>(() => getTodayProgramSlot(), []);
}

/* ---- progress & profile ---- */
export function useProgressStats(weeks = 8) {
  return useAsync<ProgressStats>(() => getProgressStats(weeks), [weeks]);
}
export function usePeriodStats(range: ProgressRange) {
  return useAsync<PeriodStats>(() => getPeriodStats(range), [range]);
}
export function useWeeklyRecap(weekStartMs?: number) {
  const { unit } = useSettings();
  return useAsync<WeeklyRecap>(() => getWeeklyRecap(weekStartMs ?? Date.now(), unit), [weekStartMs, unit]);
}
export function useMonthlyRecap(monthStartMs?: number) {
  const { unit } = useSettings();
  return useAsync<MonthlyRecap>(() => getMonthlyRecap(monthStartMs ?? Date.now(), unit), [monthStartMs, unit]);
}
export function useProfile() {
  return useAsync<UserProfile>(() => getProfile(), []);
}

/* ---- paginated history (infinite scroll) ---- */
export function useWorkoutLogs(filters: WorkoutLogFilters = {}) {
  const [items, setItems] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const filtersKey = `${filters.sinceMs ?? ''}:${filters.templateId ?? ''}:${filters.exerciseId ?? ''}`;
  const filtersRef = useRef(filters);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const offset = reset ? 0 : offsetRef.current;
      const page = await listWorkoutLogs(offset, undefined, filtersRef.current);
      setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
      offsetRef.current = page.nextOffset ?? offset;
      setHasMore(page.nextOffset !== null);
    } catch (e) {
      setError(e as Error);
      if (reset) setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Keep prior rows until the new page arrives so FlashList doesn't jump
    // when History date/exercise/template chips change.
    offsetRef.current = 0;
    setHasMore(true);
    load(true);
  }, [load, filtersKey]);

  return {
    items,
    loading,
    error,
    hasMore,
    loadMore: () => {
      if (!loading && hasMore) load(false);
    },
    refresh: () => load(true),
    prs: [] as PR[],
    muscleFocus: [] as MuscleGroup[],
  };
}

export function useWorkoutFeedLogs() {
  const [items, setItems] = useState<FeedWorkoutLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);

  const load = useCallback(async (reset: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const offset = reset ? 0 : offsetRef.current;
      const page = await listWorkoutFeedLogs(offset);
      setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
      offsetRef.current = page.nextOffset ?? offset;
      setHasMore(page.nextOffset !== null);
    } catch (e) {
      setError(e as Error);
      if (reset) setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) load(false);
  }, [loading, hasMore, load]);
  const refresh = useCallback(() => load(true), [load]);

  return {
    items,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}

/* ---- active workout / session ---- */
export function useActiveSession() {
  return useAsync<SessionWorkout | null>(() => getActiveWorkout(), []);
}

export function useWorkoutLog(id: number) {
  return useAsync<SessionWorkout | null>(() => getWorkoutLog(id), [id]);
}


