/**
 * Batched push (#139 / #201): table order, chunking, ack only on
 * applied/stale/absent, per-row quarantine that never blocks other rows,
 * and auth failures that stop the run without burning attempts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDbHandle } from '@/db/__tests__/sqlite-adapter';
import { setErrorSink } from '@/lib/error-sink';

let currentDb: TestDbHandle | null = null;

vi.mock('@/db/client', () => ({
  openDatabase: async () => {
    if (!currentDb) throw new Error('test db not mounted');
    return currentDb;
  },
}));

import type { PushOp } from '../mappers';
import { enqueueSync, listOutbox, pushBackoffMs, quarantinedOutboxCount } from '../outbox';
import {
  MAX_PUSH_ATTEMPTS,
  PUSH_CHUNK,
  pushOutbox,
  rpcFailure,
  settlePushResults,
  SyncAuthError,
  type PushRowResult,
  type PushRpc,
  type PushSummary,
} from '../push';
import type { SyncTable } from '../types';

/** Summary with no dead-letters or whole-table failures. */
function clean(pushed: number, failed: number): PushSummary {
  return { pushed, failed, deadLettered: 0, tableErrors: [] };
}

interface Call {
  table: SyncTable;
  ops: PushOp[];
}

function recordingRpc(decide: (table: SyncTable, op: PushOp) => string = () => 'applied') {
  const calls: Call[] = [];
  const rpc: PushRpc = async (table, ops) => {
    calls.push({ table, ops });
    return ops.map((op, idx): PushRowResult => {
      const status = decide(table, op);
      return { idx, status, message: status === 'error' ? '23503: fk violation' : null };
    });
  };
  return { rpc, calls };
}

describe('settlePushResults', () => {
  it('acks applied, stale and absent; retries error and unreported rows', () => {
    const { ack, retry } = settlePushResults(
      ['a', 'b', 'c', 'd', 'e'],
      [
        { idx: 0, status: 'applied', message: null },
        { idx: 1, status: 'stale', message: null },
        { idx: 2, status: 'absent', message: null },
        { idx: 3, status: 'error', message: '22P02: bad uuid' },
      ],
    );
    expect(ack).toEqual(['a', 'b', 'c']);
    expect(retry).toEqual([
      { item: 'd', message: '22P02: bad uuid' },
      { item: 'e', message: 'no result' },
    ]);
  });
});

describe('rpcFailure', () => {
  it('classifies auth failures', () => {
    expect(rpcFailure({ code: 'PGRST301', message: 'JWT expired' }, 401)).toBeInstanceOf(SyncAuthError);
    expect(rpcFailure({ code: '42501', message: 'permission denied for function sync_push' }, 403))
      .toBeInstanceOf(SyncAuthError);
    expect(rpcFailure({ code: '28000', message: 'no authenticated subject' }, 400))
      .toBeInstanceOf(SyncAuthError);
  });

  it('flags a missing server function as a deploy problem, not auth', () => {
    const err = rpcFailure({ code: 'PGRST202', message: 'Could not find the function' }, 404);
    expect(err).not.toBeInstanceOf(SyncAuthError);
    expect(err.message).toMatch(/sync-schema\.sql/);
  });
});

describe('pushOutbox', () => {
  let close: () => void;

  beforeEach(() => {
    const t = createTestDatabase();
    currentDb = t.db;
    close = t.close;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    close();
    currentDb = null;
    setErrorSink(null);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('pushes parents before children, in chunks, and acks everything applied', async () => {
    const sets = PUSH_CHUNK * 2 + 5;
    for (let i = 0; i < sets; i++) {
      await enqueueSync('set_entries', `set-${i}`, 'upsert', {
        workout_log_uuid: 'log-1',
        updated_at: 1_000 + i,
      });
    }
    await enqueueSync('workout_logs', 'log-1', 'upsert', { name: 'Push', started_at: 1, updated_at: 900 });

    const { rpc, calls } = recordingRpc();
    const result = await pushOutbox('user-1', rpc);

    expect(calls.map((c) => [c.table, c.ops.length])).toEqual([
      ['workout_logs', 1],
      ['set_entries', PUSH_CHUNK],
      ['set_entries', PUSH_CHUNK],
      ['set_entries', 5],
    ]);
    expect(result).toEqual(clean(sets + 1, 0));
    expect(await listOutbox(1000)).toHaveLength(0);
  });

  it('acks stale rows (cloud already newer) without rewriting them', async () => {
    await enqueueSync('bodyweight_entries', 'bw-1', 'upsert', { weight: 80, recorded_at: 1, updated_at: 5 });
    const { rpc } = recordingRpc(() => 'stale');
    expect(await pushOutbox('user-1', rpc)).toEqual(clean(1, 0));
    expect(await listOutbox()).toHaveLength(0);
  });

  it('a poison row does not block the rows after it, backs off, and is dead-lettered after N attempts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    const reported: Record<string, unknown>[] = [];
    setErrorSink((_err, ctx) => reported.push(ctx ?? {}));

    await enqueueSync('set_entries', 'poison', 'upsert', { updated_at: 1 });
    // More than one chunk behind the poison row: all of it must flow.
    for (let i = 0; i < PUSH_CHUNK + 3; i++) {
      await enqueueSync('set_entries', `good-${i}`, 'upsert', { updated_at: 2 + i });
    }
    await enqueueSync('bodyweight_entries', 'bw', 'upsert', { weight: 80, recorded_at: 1, updated_at: 3 });

    const { rpc, calls } = recordingRpc((_t, op) => (op.row.id === 'poison' ? 'error' : 'applied'));
    expect(await pushOutbox('user-1', rpc)).toEqual(clean(PUSH_CHUNK + 4, 1));
    const left = await listOutbox();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({
      rowUuid: 'poison',
      attempts: 1,
      nextAttemptAt: 1_000_000 + pushBackoffMs(1),
    });

    // Backing off: an immediate rerun does not resend it.
    const sentBefore = calls.length;
    expect(await pushOutbox('user-1', rpc)).toEqual(clean(0, 0));
    expect(calls.length).toBe(sentBefore);

    let last = clean(0, 0);
    for (let run = 1; run < MAX_PUSH_ATTEMPTS; run++) {
      vi.setSystemTime(Date.now() + pushBackoffMs(run));
      last = await pushOutbox('user-1', rpc);
    }
    expect(last.deadLettered).toBe(1);
    expect((await listOutbox())[0].attempts).toBe(MAX_PUSH_ATTEMPTS);
    expect(await quarantinedOutboxCount(MAX_PUSH_ATTEMPTS)).toBe(1);
    // Reported once, with the SQLSTATE only (no payload, no message text).
    expect(reported).toEqual([
      { where: 'sync.push', table: 'set_entries', code: '23503', attempts: MAX_PUSH_ATTEMPTS },
    ]);

    // Dead-lettered: no longer sent at all, however long we wait.
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000);
    const before = calls.length;
    expect(await pushOutbox('user-1', rpc)).toEqual(clean(0, 0));
    expect(calls.length).toBe(before);

    // A new local edit resets attempts and backoff, and releases it.
    await enqueueSync('set_entries', 'poison', 'upsert', { updated_at: 10 });
    expect(await quarantinedOutboxCount(MAX_PUSH_ATTEMPTS)).toBe(0);
    const healed = recordingRpc();
    expect(await pushOutbox('user-1', healed.rpc)).toEqual(clean(1, 0));
  });

  it('a table whose call fails outright does not stop independent tables', async () => {
    await enqueueSync('user_templates', 'tpl-1', 'upsert', { name: 'A', updated_at: 1 });
    await enqueueSync('user_template_exercises', 'te-1', 'upsert', { template_uuid: 'tpl-1', updated_at: 1 });
    await enqueueSync('workout_logs', 'log-1', 'upsert', { name: 'Push', started_at: 1, updated_at: 1 });
    await enqueueSync('set_entries', 'set-1', 'upsert', { workout_log_uuid: 'log-1', updated_at: 1 });
    await enqueueSync('bodyweight_entries', 'bw-1', 'upsert', { weight: 80, recorded_at: 1, updated_at: 1 });

    const calls: SyncTable[] = [];
    const rpc: PushRpc = async (table, ops) => {
      calls.push(table);
      if (table === 'user_templates') throw new Error('Sync push failed: payload too large');
      return ops.map((_, idx) => ({ idx, status: 'applied', message: null }));
    };
    const result = await pushOutbox('user-1', rpc);

    // Children of the failed table wait; unrelated tables still go out.
    expect(calls).toEqual(['user_templates', 'bodyweight_entries']);
    expect(result.pushed).toBe(1);
    expect(result.tableErrors).toEqual([
      { table: 'user_templates', message: 'Sync push failed: payload too large' },
      { table: 'user_template_exercises', message: 'waiting on user_templates', blockedBy: 'user_templates' },
      { table: 'user_program_workouts', message: 'waiting on user_templates', blockedBy: 'user_templates' },
      { table: 'workout_logs', message: 'waiting on user_templates', blockedBy: 'user_templates' },
      { table: 'set_entries', message: 'waiting on workout_logs', blockedBy: 'workout_logs' },
      { table: 'workout_photos', message: 'waiting on workout_logs', blockedBy: 'workout_logs' },
    ]);
    // Not the rows' fault: nothing charged against them.
    expect((await listOutbox()).map((r) => [r.tableName, r.attempts])).toEqual([
      ['user_templates', 0],
      ['user_template_exercises', 0],
      ['workout_logs', 0],
      ['set_entries', 0],
    ]);
  });

  it('enqueueSync refuses a table this build cannot push', async () => {
    await expect(enqueueSync('mystery_table' as SyncTable, 'x', 'upsert', {})).rejects.toThrow(
      /unknown sync table/,
    );
    expect(await listOutbox()).toHaveLength(0);
  });

  it('quarantines rows for tables this build cannot push', async () => {
    // Left by another build: enqueueSync itself refuses unknown tables now.
    await currentDb!.runAsync(
      `INSERT INTO sync_outbox (table_name, row_uuid, op, payload, created_at, attempts)
       VALUES ('mystery_table', 'x', 'upsert', '{"updated_at":1}', 1, 0)`,
    );
    const { rpc, calls } = recordingRpc();
    await pushOutbox('user-1', rpc);
    expect(calls).toHaveLength(0);
    expect(await quarantinedOutboxCount(MAX_PUSH_ATTEMPTS)).toBe(1);
  });

  it('counts an unreadable payload as a failed attempt without sending it', async () => {
    const db = currentDb!;
    await db.runAsync(
      `INSERT INTO sync_outbox (table_name, row_uuid, op, payload, created_at, attempts)
       VALUES ('set_entries', 'broken', 'upsert', '{not json', 1, 0)`,
    );
    await enqueueSync('set_entries', 'fine', 'upsert', { updated_at: 2 });
    const { rpc, calls } = recordingRpc();
    expect(await pushOutbox('user-1', rpc)).toEqual(clean(1, 1));
    expect(calls[0].ops.map((o) => o.row.id)).toEqual(['fine']);
    expect((await listOutbox())[0]).toMatchObject({ rowUuid: 'broken', attempts: 1 });
  });

  it('stops on an auth failure without touching attempts', async () => {
    await enqueueSync('workout_logs', 'log-1', 'upsert', { updated_at: 1 });
    await enqueueSync('set_entries', 'set-1', 'upsert', { updated_at: 2 });
    const calls: SyncTable[] = [];
    const rpc: PushRpc = async (table) => {
      calls.push(table);
      throw new SyncAuthError('Sync sign-in rejected by server: JWT expired');
    };
    await expect(pushOutbox('user-1', rpc)).rejects.toBeInstanceOf(SyncAuthError);
    expect(calls).toEqual(['workout_logs']);
    expect((await listOutbox()).map((r) => r.attempts)).toEqual([0, 0]);
  });

  it('keeps an edit that coalesced into the row mid-push (neither acked nor penalised)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    await enqueueSync('set_entries', 'set-1', 'upsert', { weight: 100, updated_at: 1_000 });

    const rpc: PushRpc = async (_table, ops) => {
      vi.setSystemTime(2_000);
      await enqueueSync('set_entries', 'set-1', 'upsert', { weight: 105, updated_at: 2_000 });
      return ops.map((_, idx) => ({ idx, status: 'error', message: 'x' }));
    };
    await pushOutbox('user-1', rpc);
    const [left] = await listOutbox();
    expect(JSON.parse(left.payload ?? '{}')).toMatchObject({ weight: 105 });
    expect(left.attempts).toBe(0);
    vi.useRealTimers();
  });
});
