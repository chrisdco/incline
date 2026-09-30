/**
 * Shared column widths for session set headers + rows — keep in sync.
 * Hevy-style proportions: index/done fixed; prev/input cells flex so the
 * KG/REPS boxes stay compact on wide screens instead of ballooning while
 * fixed columns stand still (flex:1 on inputs alone caused exactly that).
 */
export const SET_COL = {
  index: 28,
  done: 44,
} as const;

/** Proportional widths: prev carries long "80kg×8" strings, KG/REPS stay equal. */
export const SET_FLEX = {
  prev: 1.25,
  input: 1,
} as const;

export const SET_ROW_HEIGHT = 52;
export const SET_INPUT_HEIGHT = 44;
