export type ApplyStatus = 'ok' | 'blocked';

/** Give up on a blocked row (parent never arrives) after this many re-fetches. */
export const MAX_BLOCKED_RETRIES = 5;

/**
 * Per-table pull position (#140). `ts` is the server's own updated_at string
 * (never re-serialized from ms, so microsecond values cannot re-match
 * forever) and `id` breaks ties between rows sharing a timestamp. Blocked
 * rows (child whose parent is not local yet) go to `retry` — keyed by row id,
 * value = failed applies — instead of pinning the cursor, so one bad child
 * can no longer stall every row behind it.
 */
export interface TableCursor {
  ts: string | null;
  id: string | null;
  retry: Record<string, number>;
}

export const EMPTY_CURSOR: TableCursor = { ts: null, id: null, retry: {} };

export interface AppliedRow {
  ts: string;
  id: string;
  status: ApplyStatus;
}

/**
 * Advance past one page (rows in server order: updated_at, id). The cursor
 * always moves to the last row; blocked rows are parked for retry and rows
 * that now applied leave the retry set.
 */
export function foldPage(cursor: TableCursor, page: AppliedRow[]): TableCursor {
  if (page.length === 0) return cursor;
  const retry = { ...cursor.retry };
  for (const r of page) {
    if (r.status === 'blocked') retry[r.id] = (retry[r.id] ?? 0) + 1;
    else delete retry[r.id];
  }
  const last = page[page.length - 1];
  return { ts: last.ts, id: last.id, retry: dropExhausted(retry) };
}

/**
 * Settle a re-fetch of the retry set. `results` holds the ids the server
 * still returned; an id it no longer returns (hard-deleted / moved past by a
 * newer page) leaves the set.
 */
export function settleRetries(
  cursor: TableCursor,
  results: { id: string; status: ApplyStatus }[],
): TableCursor {
  const retry: Record<string, number> = {};
  for (const r of results) {
    if (r.status !== 'blocked' || cursor.retry[r.id] == null) continue;
    retry[r.id] = cursor.retry[r.id] + 1;
  }
  return { ...cursor, retry: dropExhausted(retry) };
}

function dropExhausted(retry: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(retry)) {
    if (n < MAX_BLOCKED_RETRIES) out[id] = n;
    else console.warn('[sync] dropping unresolvable pulled row', id, `after ${n} tries`);
  }
  return out;
}
