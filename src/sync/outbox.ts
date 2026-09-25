import { openDatabase } from '@/db/client';
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

/** Enqueue a mutation for later push. Coalesces duplicate pending rows for the same uuid. */
export async function enqueueSync(
  tableName: SyncTable,
  rowUuid: string,
  op: SyncOp,
  payload?: Record<string, unknown> | null,
): Promise<void> {
  const db = await openDatabase();
  const now = Date.now();
  const json = payload ? JSON.stringify(payload) : null;

  // Single-statement coalesce. The old DELETE + bare INSERT pair could lose
  // the mutation on a kill between statements (local row already bumped, so
  // pull LWW would never repair it). Requires the UNIQUE index created in
  // schema.ts / ensure-sync-schema.ts. Atomic alone and safe to call inside a
  // larger withTransactionAsync (no nesting involved).
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

export async function listOutbox(limit = 100): Promise<OutboxRow[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    table_name: string;
    row_uuid: string;
    op: string;
    payload: string | null;
    created_at: number;
    attempts: number;
  }>('SELECT * FROM sync_outbox ORDER BY id ASC LIMIT ?', limit);

  return rows.map((r) => ({
    id: r.id,
    tableName: r.table_name as SyncTable,
    rowUuid: r.row_uuid,
    op: r.op as SyncOp,
    payload: r.payload,
    createdAt: r.created_at,
    attempts: r.attempts,
  }));
}

export async function removeOutbox(id: number): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('DELETE FROM sync_outbox WHERE id = ?', id);
}

export async function bumpOutboxAttempt(id: number): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('UPDATE sync_outbox SET attempts = attempts + 1 WHERE id = ?', id);
}

export async function clearOutbox(): Promise<void> {
  const db = await openDatabase();
  await db.execAsync('DELETE FROM sync_outbox');
}

export async function outboxCount(): Promise<number> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM sync_outbox');
  return row?.c ?? 0;
}
