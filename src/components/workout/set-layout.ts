/**
 * Shared column widths for session set headers + rows — keep in sync.
 * Proportional flex matching the Hevy reference (Sep 2026 shot): prev
 * widest (long "80kg×8" strings), KG/REPS equal, tick fixed at the end.
 * Fixed widths were tried and left gaps on wide screens; equal flex
 * ballooned inputs without prev growing along. Locked: do not restyle
 * without a device screenshot proving the current geometry wrong.
 */
export const SET_COL = {
  index: 28,
  done: 44,
} as const;

/** Column proportions measured off the Hevy reference (prev 1.4 : inputs 1). */
export const SET_FLEX = {
  prev: 1.4,
  input: 1,
} as const;

export const SET_ROW_HEIGHT = 52;
export const SET_INPUT_HEIGHT = 44;
