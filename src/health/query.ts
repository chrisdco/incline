import { queryOptions } from '@tanstack/react-query';

import { kvStorage } from '@/db/kv';
import { importHealthWeights } from '@/db/queries/bodyweight';
import { queryClient } from '@/lib/query-client';

import { getHealthPort } from './index';
import { readHealthSnapshot } from './readiness';

/**
 * Health reads through TanStack Query. The source is the platform store,
 * not SQLite, so this key is not table-led: it refreshes when stale on the
 * next mount (30 min) and when the user connects. No timers, no focus refetch.
 */
export const HEALTH_SNAPSHOT_KEY = ['health', 'snapshot'] as const;
const WEIGHT_SYNC_KEY = 'health.weightSync.day';
const DAY = 86_400_000;

/** Pulls the last 30 days of weigh-ins into bodyweight entries, once a day. */
export async function syncHealthWeights(now = Date.now()): Promise<number> {
  const day = new Date(now).toDateString();
  if ((await kvStorage.getItem(WEIGHT_SYNC_KEY)) === day) return 0;
  const port = getHealthPort();
  if (!(await port.granted()).includes('weight')) return 0;
  const added = await importHealthWeights(await port.readPoints('weight', { start: now - 30 * DAY, end: now }));
  await kvStorage.setItem(WEIGHT_SYNC_KEY, day);
  return added;
}

export const healthSnapshotQuery = queryOptions({
  queryKey: HEALTH_SNAPSHOT_KEY,
  queryFn: async () => {
    const snapshot = await readHealthSnapshot(getHealthPort());
    // Best effort; a failed import never hides the snapshot.
    void syncHealthWeights().catch(() => {});
    return snapshot;
  },
  staleTime: 30 * 60_000,
  retry: false,
});

export function refreshHealth(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: HEALTH_SNAPSHOT_KEY });
}
