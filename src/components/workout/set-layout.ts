/**
 * Shared column widths for session set headers + rows — keep in sync.
 * Hevy-style: index/prev/done are fixed; weight/reps flex to fill so the
 * done toggle sits snug at the row end instead of drifting to the edge.
 */
export const SET_COL = {
  index: 28,
  prev: 88,
  done: 44,
} as const;

export const SET_ROW_HEIGHT = 52;
export const SET_INPUT_HEIGHT = 44;
