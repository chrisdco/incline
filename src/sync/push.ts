/**
 * Batched outbox push (#139 / #143).
 *
 * One `sync_push` RPC per table chunk, parents before children (PUSH_ORDER).
 * Last-write-wins is decided server-side in the same statement as the write
 * (`ON CONFLICT ... WHERE excluded.updated_at > t.updated_at`), so there is
 * no read-then-write race between devices. Each row comes back
 * applied / stale / absent (all acked) or error (attempt bumped + per-row
 * backoff). A row that keeps failing is dead-lettered at MAX_PUSH_ATTEMPTS —
 * skipped, reported, never blocking the rows behind it — until a new local
 * edit resets it. A whole-call failure (other than auth) stops only that
 * table and the tables whose rows reference it; the rest still push.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { captureError } from '@/lib/error-sink';
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

/**
 * Server FKs (supabase/sync-schema.sql) a child row needs its parent for. When
 * a parent table's call fails outright, its children wait for the next run
 * instead of burning attempts on FK errors the parent push would have fixed.
 */
const PUSH_PARENTS: Partial<Record<SyncTable, SyncTable[]>> = {
  user_template_exercises: ['user_templates', 'user_exercises'],
  user_program_workouts: ['user_programs', 'user_templates'],
  workout_logs: ['user_templates'],
  set_entries: ['workout_logs', 'user_exercises'],
  workout_photos: ['workout_logs'],
  user_active_program: ['user_programs'],
};

export interface PushTableError {
  table: SyncTable;
  message: string;
  /** Set when the table was held back behind a failed parent, not tried. */
  blockedBy?: SyncTable;
}

export interface PushSummary {
  pushed: number;
  failed: number;
  /** Rows that hit MAX_PUSH_ATTEMPTS this run. */
  deadLettered: number;
  /** Tables whose call failed outright (or were held back behind one). */
  tableErrors: PushTableError[];
}

/** SQLSTATE prefix of a row error ("23503: …") — the part safe to report. */
function errorCode(message: string): string {
  return message.split(':')[0]?.trim().slice(0, 16) || 'unknown';
}

export async function pushOutbox(userId: string, rpc: PushRpc): Promise<PushSummary> {
  await quarantineUnknownTables(PUSH_ORDER, MAX_PUSH_ATTEMPTS);
  let pushed = 0;
  let failed = 0;
  let deadLettered = 0;
  const tableErrors: PushTableError[] = [];
  const blocked = new Set<SyncTable>();

  const fail = async (table: SyncTable, item: OutboxRow, message: string) => {
    failed++;
    const counted = await bumpOutboxAttempt(item);
    if (counted && item.attempts + 1 >= MAX_PUSH_ATTEMPTS) {
      deadLettered++;
      captureError(new Error('sync push row dead-lettered'), {
        where: 'sync.push',
        table,
        code: errorCode(message),
        attempts: item.attempts + 1,
      });
    } else {
      console.warn('[sync] push row failed', table, item.rowUuid, message);
    }
  };

  for (const table of PUSH_ORDER) {
    const parent = PUSH_PARENTS[table]?.find((p) => blocked.has(p));
    if (parent) {
      blocked.add(table);
      tableErrors.push({ table, message: `waiting on ${parent}`, blockedBy: parent });
      continue;
    }

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
          await fail(table, item, `unmappable: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (ops.length > 0) {
        let results: PushRowResult[];
        try {
          results = await rpc(table, ops);
        } catch (err) {
          // Auth stops everything (#201). Anything else is not attributable
          // to a row: leave attempts alone and move on to independent tables.
          if (err instanceof SyncAuthError) throw err;
          blocked.add(table);
          tableErrors.push({ table, message: err instanceof Error ? err.message : String(err) });
          break;
        }
        const { ack, retry } = settlePushResults(sent, results);
        for (const item of ack) await removeOutbox(item);
        for (const { item, message } of retry) await fail(table, item, message);
        pushed += ack.length;
      }

      if (page.length < PUSH_CHUNK) break;
    }
  }

  return { pushed, failed, deadLettered, tableErrors };
}
