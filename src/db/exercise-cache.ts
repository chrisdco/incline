import type { Exercise } from './types';

/**
 * In-memory exercise catalog cache: stale-while-revalidate for pickers.
 *
 * `listExercises()` fully maps the catalog (5 queries after the batch fix,
 * still seconds on slow devices for 300+ rows plus JS assembly). The pick
 * screen used to block on a spinner every open; now it renders the cached
 * catalog synchronously and refreshes in the background.
 *
 * Safety: readers always revalidate after mount, so the worst case is one
 * stale open. Writers that change catalog membership invalidate explicitly;
 * a full account wipe clears the cache (ids restart, same rule as sessions).
 */
let catalog: Exercise[] | null = null;

export function getCachedCatalog(): Exercise[] | null {
  return catalog;
}

export function setCachedCatalog(next: Exercise[]): void {
  catalog = next;
}

export function invalidateCatalog(): void {
  catalog = null;
}

export function clearExerciseCache(): void {
  catalog = null;
}
