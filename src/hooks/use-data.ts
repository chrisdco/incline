import { useCallback, useMemo } from 'react';
import { useIsFocused } from 'expo-router';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import {
  getExercise,
  getExerciseHistory,
  getExercisePRSummary,
  getExerciseRepRecords,
  getExerciseSeries,
  getProgram,
  getProfile,
  getPeriodStats,
  getProgressStats,
  getSuggestedTemplate,
  getTemplate,
  getTodayProgramSlot,
  getWeeklyRecap,
  getMonthlyRecap,
  listPrograms,
  listTemplateSummaries,
  listWorkoutLogs,
  listWorkoutFeedLogs,
  searchExercises,
  type ExerciseFilters,
  type TodayProgramSlot,
  type WorkoutLogFilters,
} from '@/db/queries';
import type { Exercise, MonthlyRecap, PeriodStats, ProgressRange, Program, ProgressStats, SearchHit, UserProfile, WeeklyRecap, WorkoutTemplate } from '@/db/types';
import type { DbTable } from '@/db/write';
import { dbKey } from '@/lib/query-client';
import { TABLES } from '@/lib/query-keys';
import { useSettings } from '@/store/settings-store';

/**
 * A SQLite read as a query: keyed by the tables it reads (so writes to them
 * invalidate it — no focus refetches), previous data kept across key changes
 * and refetches (skeletons gate on `loading && data == null`, §8).
 *
 * Only a focused screen subscribes: tabs stay mounted under the session
 * stack, and an unfocused observer would refetch on every set edit. Stale
 * queries refetch when their screen regains focus.
 *
 * `loading` means "no data yet" — a background revalidate never flips it, so
 * reopening a screen paints cached rows instead of flashing a skeleton.
 * `fetching` is the revalidate flag for anything that wants it.
 */
export function useDbQuery<T>(tables: readonly DbTable[], key: unknown[], fn: () => Promise<T>) {
  const focused = useIsFocused();
  const q = useQuery({
    queryKey: dbKey(tables, ...key),
    queryFn: fn,
    placeholderData: keepPreviousData,
    subscribed: focused,
  });
  const { refetch } = q;
  return {
    data: q.data ?? null,
    loading: q.isPending,
    fetching: q.isFetching,
    error: q.error,
    refetch: useCallback(() => {
      void refetch();
    }, [refetch]),
  };
}

/* ---- catalog ---- */
export function useExercise(id: number) {
  return useDbQuery<Exercise | null>(TABLES.catalog, ['exercise', id], () => getExercise(id));
}
export function useSearchExercises(query: string, filters?: ExerciseFilters) {
  return useDbQuery<SearchHit[]>(
    TABLES.catalog,
    ['search', query, filters?.muscle ?? null, filters?.equipment ?? null, filters?.pattern ?? null],
    () => searchExercises(query, filters),
  );
}
export function useExerciseHistory(exerciseId: number) {
  return useDbQuery(TABLES.logs, ['exerciseHistory', exerciseId], () => getExerciseHistory(exerciseId));
}
/** PRs, rep records and chart series for exercise detail: one cached read, refreshed by set writes. */
export function useExerciseStats(exerciseId: number) {
  return useDbQuery(TABLES.logs, ['exerciseStats', exerciseId], async () => {
    if (!exerciseId) return { prSummary: null, repRecords: [], series: [] };
    const [prSummary, repRecords, series] = await Promise.all([
      getExercisePRSummary(exerciseId),
      getExerciseRepRecords(exerciseId),
      getExerciseSeries(exerciseId),
    ]);
    return { prSummary, repRecords, series };
  });
}

/* ---- templates & programs ---- */
export function useTemplateSummaries() {
  return useDbQuery(TABLES.templates, ['templateSummaries'], () => listTemplateSummaries());
}
export function useTemplate(id: number) {
  return useDbQuery<WorkoutTemplate | null>(TABLES.templates, ['template', id], () => getTemplate(id));
}
export function useSuggestedTemplate() {
  return useDbQuery<WorkoutTemplate | null>(TABLES.programs, ['suggestedTemplate'], () => getSuggestedTemplate());
}
export function usePrograms() {
  return useDbQuery<Program[]>(TABLES.programs, ['programs'], () => listPrograms());
}
export function useProgram(id: number) {
  return useDbQuery<Program | null>(TABLES.programs, ['program', id], () => getProgram(id));
}
export function useTodayProgramSlot() {
  return useDbQuery<TodayProgramSlot | null>(TABLES.programs, ['todayProgramSlot'], () => getTodayProgramSlot());
}

/* ---- progress & profile ---- */
export function useProgressStats(weeks = 8) {
  return useDbQuery<ProgressStats>(TABLES.progress, ['progressStats', weeks], () => getProgressStats(weeks));
}
export function usePeriodStats(range: ProgressRange) {
  return useDbQuery<PeriodStats>(TABLES.progress, ['periodStats', range], () => getPeriodStats(range));
}
export function useWeeklyRecap(weekStartMs?: number) {
  const unit = useSettings((s) => s.unit);
  return useDbQuery<WeeklyRecap>(TABLES.progress, ['weeklyRecap', weekStartMs ?? null, unit], () =>
    getWeeklyRecap(weekStartMs ?? Date.now(), unit),
  );
}
export function useMonthlyRecap(monthStartMs?: number) {
  const unit = useSettings((s) => s.unit);
  return useDbQuery<MonthlyRecap>(TABLES.progress, ['monthlyRecap', monthStartMs ?? null, unit], () =>
    getMonthlyRecap(monthStartMs ?? Date.now(), unit),
  );
}
export function useProfile() {
  return useDbQuery<UserProfile>(TABLES.profile, ['profile'], () => getProfile());
}

/* ---- paginated history (infinite scroll) ---- */

/** Infinite-scroll page of rows over `useInfiniteQuery`, same shape as before. */
function usePagedDbQuery<T>(
  key: unknown[],
  fetchPage: (offset: number) => Promise<{ items: T[]; nextOffset: number | null }>,
) {
  const focused = useIsFocused();
  const q = useInfiniteQuery({
    queryKey: dbKey(TABLES.logs, ...key),
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    // Keep prior rows until the new first page arrives so FlashList doesn't
    // jump when History date/exercise/template chips change.
    placeholderData: keepPreviousData,
    subscribed: focused,
  });
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const { isFetching, hasNextPage, fetchNextPage, refetch } = q;
  return {
    items,
    loading: isFetching,
    error: q.error,
    hasMore: q.isPending || hasNextPage,
    loadMore: () => {
      if (!isFetching && hasNextPage) void fetchNextPage();
    },
    refresh: () => {
      void refetch();
    },
  };
}

export function useWorkoutLogs(filters: WorkoutLogFilters = {}) {
  return usePagedDbQuery(
    ['workoutLogs', filters.sinceMs ?? null, filters.templateId ?? null, filters.exerciseId ?? null],
    (offset) => listWorkoutLogs(offset, undefined, filters),
  );
}

export function useWorkoutFeedLogs() {
  return usePagedDbQuery(['workoutFeed'], (offset) => listWorkoutFeedLogs(offset));
}
