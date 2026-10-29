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

/**
 * Flex cell styles. flexBasis 0 + minWidth 0 make every row split the width
 * by proportion alone, so a longer PREV ("105 kg×6") can never push KG/REPS
 * off the header columns (device screenshot, Oct 29).
 */
export const SET_CELL = {
  prev: { flexGrow: SET_FLEX.prev, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  input: { flexGrow: SET_FLEX.input, flexShrink: 1, flexBasis: 0, minWidth: 0 },
} as const;
