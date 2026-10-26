import { QueryClient, type QueryKey } from '@tanstack/react-query';

import { onTablesChanged } from '@/db/changes';
import type { DbTable } from '@/db/write';

/**
 * One QueryClient for local SQLite reads. SQLite is the source of truth and
 * the cache is disposable, so:
 *
 * - `staleTime: Infinity` — data never goes stale on a timer; it goes stale
 *   when a table it reads changes (the table-change event below).
 * - `networkMode: 'always'` — these are local reads; never pause them offline.
 * - `retry: false` — a failing local query will fail the same way again.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      networkMode: 'always',
      retry: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Every query key starts with the tables the query reads. Invalidation is by
 * table: a change to any of them marks the query stale (and refetches it if a
 * focused screen observes it).
 */
export function dbKey(tables: readonly DbTable[], ...rest: unknown[]): QueryKey {
  return [tables, ...rest];
}

export function invalidateTables(changed: ReadonlySet<string>): void {
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const tables = query.queryKey[0];
      return Array.isArray(tables) && tables.some((t) => changed.has(t as string));
    },
  });
}

onTablesChanged(invalidateTables);
