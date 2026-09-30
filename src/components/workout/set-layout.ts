/**
 * Shared column widths for session set headers + rows — keep in sync.
 * Baseline geometry (Sep 19, pre-regression): fixed compact columns; the
 * trailing spacer absorbs slack. Sep 29–30 widened/flexed inputs twice and
 * both regressed on real screens — reverted. Do not resize without a
 * device screenshot proving the current geometry wrong.
 */
export const SET_COL = {
  index: 28,
  prev: 88,
  weight: 72,
  reps: 64,
  done: 48,
} as const;

export const SET_ROW_HEIGHT = 48;
export const SET_INPUT_HEIGHT = 40;
