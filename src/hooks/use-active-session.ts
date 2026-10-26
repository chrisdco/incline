import { useCallback, useEffect } from 'react';
import { useIsFocused } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { getActiveWorkout } from '@/db/queries';
import { dbKey } from '@/lib/query-client';
import { TABLES } from '@/lib/query-keys';
import { useActiveWorkout } from '@/store/active-workout-store';

/**
 * The in-progress session as a query over the log tables: start / finish /
 * discard invalidate it, so the active session bar appears and disappears
 * without manual refetches. Mirrors the result into the zustand activeLogId.
 * Focus-gated like every DB query: set edits mid-session don't refetch it
 * behind the session screen.
 */
export function useActiveSession() {
  const focused = useIsFocused();
  const setActive = useActiveWorkout((s) => s.setActive);
  const clear = useActiveWorkout((s) => s.clear);
  const q = useQuery({
    queryKey: dbKey(TABLES.logs, 'activeSession'),
    queryFn: () => getActiveWorkout(),
    subscribed: focused,
  });
  const session = q.data ?? null;
  const settled = q.isSuccess || q.isError;

  useEffect(() => {
    if (!settled) return;
    if (session) setActive(session.id);
    else clear();
  }, [settled, session, setActive, clear]);

  const { refetch } = q;
  const refetchSession = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const nextExercise = session?.sets
    ? session.sets.filter((s) => !s.completed)[0]?.exerciseName
    : undefined;

  return { session, loading: q.isPending, refetch: refetchSession, nextExercise };
}
