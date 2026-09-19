import type { SessionWorkout } from './queries/helpers';

/**
 * In-memory session cache: stale-while-revalidate for the live workout.
 *
 * Pushing `/session/[id]` remounts the screen from scratch. Without this,
 * every reopen (tray tap, resume dialog) cold-loads behind a full-screen
 * spinner that pops into content mid-transition. With it, the mount renders
 * cached rows synchronously and refreshes from SQLite in the background.
 *
 * Safety: single-writer (one active session per device), tiny data, and every
 * wipe path funnels through `resetUserData()`, which clears this cache — so a
 * recycled autoincrement id can never resurrect another account's session.
 * Finish/discard drop their entry explicitly.
 */
const cache = new Map<number, SessionWorkout>();
const MAX_ENTRIES = 5;

export function getCachedSession(logId: number): SessionWorkout | null {
  return cache.get(logId) ?? null;
}

export function setCachedSession(session: SessionWorkout): void {
  cache.delete(session.id);
  cache.set(session.id, session);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

export function dropCachedSession(logId: number): void {
  cache.delete(logId);
}

export function clearSessionCache(): void {
  cache.clear();
}
