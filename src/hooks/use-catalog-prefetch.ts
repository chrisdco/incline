import { useEffect } from 'react';

import { getCachedCatalog, setCachedCatalog } from '@/db/exercise-cache';
import { listExercises } from '@/db/queries';

/**
 * Warm the exercise catalog cache shortly after launch so the first
 * pick-screen open renders instantly. Delayed past first paint and skipped
 * when something already populated the cache. Failures are silent — the
 * picker loads on demand as before.
 */
export function useCatalogPrefetch() {
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        if (cancelled || getCachedCatalog()) return;
        try {
          const all = await listExercises();
          if (!cancelled) setCachedCatalog(all);
        } catch {
          // picker falls back to on-demand load
        }
      })();
    }, 2000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);
}
