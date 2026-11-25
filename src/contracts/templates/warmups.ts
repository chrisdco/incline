/**
 * Warm-up sets a routine row carries (WORK-QUEUE 7). One copy for app, edge
 * and web so the routine, the started workout, MCP and Ask agree.
 *
 * - A routine row stores a warm-up count; starting the routine creates that
 *   many warm-up rows ahead of the working sets.
 * - Drop sets stay per-day extras: never stored on the routine.
 */

/** Most warm-ups a routine row may carry (cloud CHECK matches). */
export const MAX_ROUTINE_WARMUPS = 10;

export function clampWarmups(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  return Math.min(MAX_ROUTINE_WARMUPS, Math.max(0, Math.round(n)));
}

/**
 * Seed weight for warm-up `index` of `count` when last time has no warm-up
 * to copy: a ramp up to the first working weight (one warm-up = 50%, more
 * climb from 40% toward 75%), rounded down to 2.5.
 */
export function warmupSeedWeight(workingWeight: number, index: number, count: number): number {
  if (!(workingWeight > 0) || count <= 0) return 0;
  const pct = count === 1 ? 0.5 : 0.4 + (0.35 * index) / (count - 1);
  // The epsilon keeps 100 × 0.575 (57.4999…) on 57.5.
  return Math.max(0, Math.floor((workingWeight * pct) / 2.5 + 1e-9) * 2.5);
}

/** "2 warm-ups + 3 sets", or "3 sets" with none: one phrasing everywhere. */
export function describeRoutineSets(sets: number, warmups: number): string {
  const working = `${sets} set${sets === 1 ? '' : 's'}`;
  if (warmups <= 0) return working;
  return `${warmups} warm-up${warmups === 1 ? '' : 's'} + ${working}`;
}
