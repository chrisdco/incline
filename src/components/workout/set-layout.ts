/**
 * Shared column widths for session set headers + rows — keep in sync.
 * Proportional flex: fixed number + tick at the edges, PREV flexes widest
 * (fits full "36.29kg×10" centered on one line), KG/REPS share the rest
 * equally. Uniform 8px gaps — no spacer void, tick never drifts.
 * (Fixed pixels left a spacer gap on wide screens; inputs-only flex
 * ballooned. Locked to these proportions.)
 */
export const SET_COL = {
  index: 28,
  done: 44,
} as const;

/** Column proportions: prev carries the longest strings, inputs stay equal. */
export const SET_FLEX = {
  prev: 1.4,
  input: 1,
} as const;

export const SET_ROW_HEIGHT = 48;
export const SET_INPUT_HEIGHT = 40;
