import { useEffect } from 'react';

import { queryClient } from '@/lib/query-client';
import { catalogQuery } from '@/lib/query-keys';

/**
 * Warm the exercise catalog query shortly after launch so the first
 * pick-screen open renders instantly. Delayed past first paint; a no-op when
 * the catalog is already cached. Failures are silent — the picker loads on
 * demand as before.
 */
export function useCatalogPrefetch() {
  useEffect(() => {
    const t = setTimeout(() => {
      void queryClient.prefetchQuery(catalogQuery);
    }, 2000);
    return () => clearTimeout(t);
  }, []);
}
