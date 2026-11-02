import { useCallback, useEffect, useState } from 'react';

import { openDatabase } from '@/db/client';
import { reportError } from '@/lib/monitoring';

export type DatabaseState = { status: 'loading' | 'ready' } | { status: 'error'; error: Error; retry: () => void };

/**
 * Triggers database open + seed on mount and reports readiness. The root layout
 * gates the splash screen on this so the first render already has data access.
 * On failure it reports `error` with a retry instead of hanging on the splash
 * (#163); openDatabase clears its cache on failure so a retry reopens.
 */
export function useDatabaseState(): DatabaseState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ status: 'loading' | 'ready' } | { status: 'error'; error: Error }>({
    status: 'loading',
  });
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);
  useEffect(() => {
    let active = true;
    openDatabase()
      .then(() => {
        if (active) setState({ status: 'ready' });
      })
      .catch((err: unknown) => {
        console.error('[db] openDatabase failed', err);
        reportError(err, { where: 'openDatabase', attempt });
        // Never route into onboarding on a broken DB: the error screen owns the UI.
        if (active) setState({ status: 'error', error: err instanceof Error ? err : new Error(String(err)) });
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return state.status === 'error' ? { ...state, retry } : state;
}

/** True once the database is open. Screens under the root gate use this. */
export function useDatabaseReady(): boolean {
  return useDatabaseState().status === 'ready';
}
