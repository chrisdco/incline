import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '@clerk/expo';

import { getSyncStatus, outboxCount, runSync, syncBackendReady, type SyncStatus } from '@/sync';

/**
 * Cloud sync status + manual trigger.
 * Set `auto` to run on mount/foreground (app shell). Settings should use `auto: false`.
 *
 * Clerk's `getToken` is stored in a ref so it does not retrigger sync effects
 * (it often changes identity every render and would otherwise loop setState).
 */
export function useCloudSync(options?: { auto?: boolean }) {
  const auto = options?.auto ?? true;
  const { isSignedIn, userId, getToken } = useAuth();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const mounted = useRef(true);
  const syncingRef = useRef(false);
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const refresh = useCallback(async () => {
    const [s, count] = await Promise.all([getSyncStatus(), outboxCount()]);
    if (!mounted.current) return;
    setStatus((prev) => {
      if (
        prev &&
        prev.cursor === s.cursor &&
        prev.status === s.status &&
        prev.lastError === s.lastError &&
        prev.lastPullAt === s.lastPullAt &&
        prev.lastPushAt === s.lastPushAt
      ) {
        return prev;
      }
      return s;
    });
    setPending((prev) => (prev === count ? prev : count));
  }, []);

  const syncNow = useCallback(async () => {
    if (!isSignedIn || !userId || !syncBackendReady()) {
      await refresh();
      return { ok: false as const, error: 'Sync unavailable' };
    }
    if (syncingRef.current) {
      return { ok: true as const, pushed: 0 };
    }
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await runSync({
        userId,
        getToken: (opts) => getTokenRef.current(opts),
      });
      await refresh();
      return result;
    } finally {
      syncingRef.current = false;
      if (mounted.current) setSyncing(false);
    }
  }, [isSignedIn, userId, refresh]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  // Auto sync: depend on identity, not syncNow (avoids loops from unstable callbacks).
  useEffect(() => {
    if (!auto || !isSignedIn || !userId) return;

    void syncNow();

    const onChange = (next: AppStateStatus) => {
      if (next === 'active') void syncNow();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncNow deliberately omitted; identity deps only
  }, [auto, isSignedIn, userId]);

  return {
    status,
    pending,
    syncing,
    enabled: syncBackendReady() && !!isSignedIn,
    syncNow,
    refresh,
  };
}
