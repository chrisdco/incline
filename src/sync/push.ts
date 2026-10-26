/**
 * Batched outbox push (#139 / #143).
 *
 * One `sync_push` RPC per table chunk, parents before children (PUSH_ORDER).
 * Last-write-wins is decided server-side in the same statement as the write
 * (`ON CONFLICT ... WHERE excluded.updated_at > t.updated_at`), so there is
 * no read-then-write race between devices. Each row comes back
 * applied / stale / absent (all acked) or error (attempt bumped). A row that
 * keeps failing is quarantined at MAX_PUSH_ATTEMPTS — skipped, never
 * blocking the rows behind it — until a new local edit resets it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { buildPushOp, type PushOp } from './mappers';
import {
  bumpOutboxAttempt,
  listPushableOutbox,
  quarantineUnknownTables,
  removeOutbox,
  type OutboxRow,
} from './outbox';
import { PUSH_ORDER } from './tables';
import type { SyncTable } from './types';

export const PUSH_CHUNK = 100;
export const MAX_PUSH_ATTEMPTS = 8;

export type PushRowStatus = 'applied' | 'stale' | 'absent' | 'error';

export interface PushRowResult {
  idx: number;
  status: PushRowStatus | string;
  message: string | null;
}

export type PushRpc = (table: SyncTable, ops: PushOp[]) => Promise<PushRowResult[]>;

/** Credentials the server will never accept — stop the run, don't burn attempts (#201). */
export class SyncAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncAuthError';
  }
}

interface RpcErrorLike {
  code?: string;
  message?: string;
}

const AUTH_CODES = new Set(['28000', '42501', 'PGRST301', 'PGRST302', 'PGRST303']);

/** Map a whole-call RPC failure to a thrown error with a status-worthy message. */
export function rpcFailure(error: RpcErrorLike, httpStatus: number): Error {
  const message = error.message ?? 'unknown error';
  if (httpStatus === 401 || httpStatus === 403 || AUTH_CODES.has(error.code ?? '') || /jwt/i.test(message)) {
    return new SyncAuthError(`Sync sign-in rejected by server: ${message}`);
  }
  if (error.code === 'PGRST202') {
    return new Error('Sync server is out of date (sync_push missing) — deploy supabase/sync-schema.sql');
  }
  return new Error(`Sync push failed: ${message}`);
}

export function supabasePushRpc(client: SupabaseClient): PushRpc {
  return async (table, ops) => {
    const { data, error, status } = await client.rpc('sync_push', { p_table: table, p_ops: ops });
    if (error) throw rpcFailure(error, status);
    return (data ?? []) as PushRowResult[];
  };
}

/**
 * Split one chunk's results into rows to ack and rows to bump. A row the
 * server did not report on counts as failed — never acked blind.
 */
export function settlePushResults<T>(
  sent: T[],
  results: PushRowResult[],
): { ack: T[]; retry: { item: T; message: string }[] } {
  const byIdx = new Map(results.map((r) => [r.idx, r]));
  const ack: T[] = [];
  const retry: { item: T; message: string }[] = [];
  sent.forEach((item, i) => {
    const r = byIdx.get(i);
    if (r && (r.status === 'applied' || r.status === 'stale' || r.status === 'absent')) {
      ack.push(item);
    } else {
      retry.push({ item, message: r ? (r.message ?? r.status) : 'no result' });
    }
  });
  return { ack, retry };
}

export interface PushSummary {
  pushed: number;
  failed: number;
}

export async function pushOutbox(userId: string, rpc: PushRpc): Promise<PushSummary> {
  await quarantineUnknownTables(PUSH_ORDER, MAX_PUSH_ATTEMPTS);
  let pushed = 0;
  let failed = 0;

  for (const table of PUSH_ORDER) {
    let afterId = 0;
    for (;;) {
      const page = await listPushableOutbox(table, {
        afterId,
        maxAttempts: MAX_PUSH_ATTEMPTS,
        limit: PUSH_CHUNK,
      });
      if (page.length === 0) break;
      afterId = page[page.length - 1].id;

      const ops: PushOp[] = [];
      const sent: OutboxRow[] = [];
      for (const item of page) {
        try {
          ops.push(buildPushOp(table, item, userId));
          sent.push(item);
        } catch (err) {
          console.warn('[sync] unmappable outbox row', table, item.rowUuid, err);
          await bumpOutboxAttempt(item);
          failed++;
        }
      }

      if (ops.length > 0) {
        const { ack, retry } = settlePushResults(sent, await rpc(table, ops));
        for (const item of ack) await removeOutbox(item);
        for (const { item, message } of retry) {
          console.warn('[sync] push row failed', table, item.rowUuid, message);
          await bumpOutboxAttempt(item);
        }
        pushed += ack.length;
        failed += retry.length;
      }

      if (page.length < PUSH_CHUNK) break;
    }
  }

  return { pushed, failed };
}
