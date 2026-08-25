export type ApplyStatus = 'ok' | 'blocked';

/** Advance the pull cursor past applied rows, but never past a blocked child. */
export function foldPullCursor(
  cursor: number,
  results: { ms: number; status: ApplyStatus }[],
): number {
  let maxOk = cursor;
  let firstBlocked: number | null = null;
  for (const r of results) {
    if (r.status === 'blocked') {
      firstBlocked = firstBlocked == null ? r.ms : Math.min(firstBlocked, r.ms);
    } else if (r.ms > maxOk) {
      maxOk = r.ms;
    }
  }
  if (firstBlocked == null) return maxOk;
  return Math.max(cursor, Math.min(maxOk, firstBlocked - 1));
}
