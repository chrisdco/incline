/**
 * Shared column widths for session set headers + rows — keep in sync.
 *
 * Reference (Hevy/Strong): SET, KG, REPS and DONE are fixed widths; PREV
 * alone takes what's left. Inputs never grow or shrink with content, so
 * every row and the header line up exactly, whether PREV is "—" or
 * "105 kg×6" (device feedback Oct 29: proportional flex still drifted and
 * made KG/REPS balloon when PREV was empty).
 */
export const SET_COL = {
  index: 32,
  input: 72,
  done: 44,
} as const;

/** Cell styles: one source for header and rows. */
export const SET_CELL = {
  index: { width: SET_COL.index },
  prev: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  input: { width: SET_COL.input, flexGrow: 0, flexShrink: 0 },
  done: { width: SET_COL.done },
} as const;

export const SET_ROW_HEIGHT = 48;
export const SET_INPUT_HEIGHT = 40;

