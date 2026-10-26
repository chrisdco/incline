import { openDatabase } from '@/db/client';
import type { Tx } from '@/db/write';
import type { SyncOp, SyncTable } from './types';

export interface OutboxRow {
  id: number;
  tableName: SyncTable;
  rowUuid: string;
  op: SyncOp;
  payload: string | null;
  createdAt: number;
  attempts: number;
}

/**
 * Enqueue a mutation for later push. Coalesces duplicate pending rows for the
 * same uuid. Pass the `mutate()` tx so the enqueue commits (or rolls back)
 * with the row change it describes; failures always throw.
 */
export async function enqueueSync(
  tableName: SyncTable,
  rowUuid: string,
  op: SyncOp,
  payload?: Record<string, unknown> | null,
  tx?: Tx,
): Promise<void> {
  const db = tx ?? (await openDatabase());
  const now = Date.now();
  const json = payload ? JSON.stringify(payload) : null;

  // Single-statement coalesce. The old DELETE + bare INSERT pair could lose
  // the mutation on a kill between statements (local row already bumped, so
  // pull LWW would never repair it). Requires the UNIQUE index created in
  // schema.ts / ensure-sync-schema.ts. Atomic alone and safe inside a
  // mutate() transaction (no nesting involved).
  await db.runAsync(
    `INSERT INTO sync_outbox (table_name, row_uuid, op, payload, created_at, attempts)
     VALUES (?, ?, ?, ?, ?, 0)
     ON CONFLICT(table_name, row_uuid)
     DO UPDATE SET op = excluded.op, payload = excluded.payload, created_at = excluded.created_at, attempts = 0`,
    tableName,
    rowUuid,
    op,
    json,
    now,
  );
}

interface OutboxDbRow {
  id: number;
  table_name: string;
  row_uuid: string;
  op: string;
  payload: string | null;
  created_at: number;
  attempts: number;
}

function mapOutboxRow(r: OutboxDbRow): OutboxRow {
  return {
    id: r.id,
    tableName: r.table_name as SyncTable,
    rowUuid: r.row_uuid,
    op: r.op as SyncOp,
    payload: r.payload,
    createdAt: r.created_at,
    attempts: r.attempts,
  };
}

export async function listOutbox(limit = 100): Promise<OutboxRow[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<OutboxDbRow>(
    'SELECT * FROM sync_outbox ORDER BY id ASC LIMIT ?',
    limit,
  );
  return rows.map(mapOutboxRow);
}

/**
 * One keyset page of a table's pushable rows (id > afterId, attempts below
 * the quarantine threshold). Keyset, not OFFSET, so rows that fail and stay
 * behind never get re-read within the same run.
 */
export async function listPushableOutbox(
  tableName: SyncTable,
  opts: { afterId: number; maxAttempts: number; limit: number },
): Promise<OutboxRow[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<OutboxDbRow>(
    `SELECT * FROM sync_outbox
     WHERE table_name = ? AND id > ? AND attempts < ?
     ORDER BY id ASC LIMIT ?`,
    tableName,
    opts.afterId,
    opts.maxAttempts,
    opts.limit,
  );
  return rows.map(mapOutboxRow);
}

/** Rows parked at/after the attempt threshold. A new edit resets attempts (see enqueueSync). */
export async function quarantinedOutboxCount(maxAttempts: number): Promise<number> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM sync_outbox WHERE attempts >= ?',
    maxAttempts,
  );
  return row?.c ?? 0;
}

/** Park rows for tables this build cannot push, instead of retrying them forever (#139). */
export async function quarantineUnknownTables(
  known: readonly string[],
  maxAttempts: number,
): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    `UPDATE sync_outbox SET attempts = ?
     WHERE attempts < ? AND table_name NOT IN (${known.map(() => '?').join(', ')})`,
    maxAttempts,
    maxAttempts,
    ...known,
  );
}

/**
 * Ack a pushed row — only if it still holds the payload that was pushed.
 * `enqueueSync` coalesces in place (same id), so an edit landing while the
 * push is in flight rewrites this row; deleting by id alone would drop that
 * newer mutation unpushed (local updated_at is newer, so pull never repairs
 * it). A changed row survives and goes out on the next run.
 */
export async function removeOutbox(
  item: Pick<OutboxRow, 'id' | 'op' | 'payload' | 'createdAt'>,
): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    'DELETE FROM sync_outbox WHERE id = ? AND op = ? AND payload IS ? AND created_at = ?',
    item.id,
    item.op,
    item.payload,
    item.createdAt,
  );
}

/**
 * Count a failed push against the row — same match as removeOutbox, so an
 * edit that coalesced in mid-push starts fresh instead of inheriting the
 * failure (and never gets quarantined for the old payload's error).
 */
export async function bumpOutboxAttempt(
  item: Pick<OutboxRow, 'id' | 'op' | 'payload' | 'createdAt'>,
): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    `UPDATE sync_outbox SET attempts = attempts + 1
     WHERE id = ? AND op = ? AND payload IS ? AND created_at = ?`,
    item.id,
    item.op,
    item.payload,
    item.createdAt,
  );
}

export async function clearOutbox(tx?: Tx): Promise<void> {
  const db = tx ?? (await openDatabase());
  await db.execAsync('DELETE FROM sync_outbox');
}

export async function outboxCount(): Promise<number> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM sync_outbox');
  return row?.c ?? 0;
}
