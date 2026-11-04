/**
 * AI activity log: a registered action writes the change + activity +
 * feedback atomically, revert restores `before` exactly once, a failing apply
 * leaves nothing, and bad types / payloads / actors / kill switches write nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDbHandle } from '@/db/__tests__/sqlite-adapter';

let currentDb: TestDbHandle | null = null;

vi.mock('@/db/client', () => ({
  openDatabase: async () => currentDb,
  openWriterDatabase: async () => currentDb,
  isDatabaseReady: () => currentDb != null,
  __resetDatabaseCacheForTests: () => {},
}));

vi.mock('expo-crypto', async () => ({ randomUUID: (await import('node:crypto')).randomUUID }));

import { __resetDeviceIdForTests } from '@/lib/device-id';

import { registerAiAction } from '../actions';
import { applyAiAction, listAiActivity, recordAiFeedback, revertAiActivity } from '../activity';
import { __resetAiFlagsForTests } from '../flags';

type Note = { notes: string };

async function noteText(): Promise<string | null> {
  const row = await currentDb!.getFirstAsync<Note>(
    'SELECT notes FROM session_exercise_notes WHERE workout_log_id = 1 AND exercise_id = 1',
  );
  return row?.notes ?? null;
}

async function setNote(tx: TestDbHandle, notes: string): Promise<void> {
  await tx.runAsync(
    `INSERT INTO session_exercise_notes (workout_log_id, exercise_id, notes, updated_at) VALUES (1, 1, ?, 0)
     ON CONFLICT(workout_log_id, exercise_id) DO UPDATE SET notes = excluded.notes`,
    notes,
  );
}

registerAiAction<string, Note, Note>({
  type: 'test.note',
  tables: ['session_exercise_notes'],
  parse: (payload) =>
    typeof payload === 'string' && payload ? { ok: true, output: payload } : { ok: false, error: 'note text required' },
  apply: async (tx, next) => {
    const before = { notes: (await noteText()) ?? '' };
    await setNote(tx as TestDbHandle, next);
    return { before, after: { notes: next }, summary: `Note → ${next}` };
  },
  revert: async (tx, before) => setNote(tx as TestDbHandle, before.notes),
});

registerAiAction({
  type: 'test.one_way',
  tables: [],
  parse: () => ({ ok: true, output: null }),
  apply: async () => ({ before: null, after: null, summary: 'x' }),
});

let close: () => void;
const fault = { failOn: null as RegExp | null };

beforeEach(async () => {
  const t = createTestDatabase(fault);
  currentDb = t.db;
  close = t.close;
  fault.failOn = null;
  __resetAiFlagsForTests();
  __resetDeviceIdForTests();
  await setNote(t.db, 'original');
});

afterEach(() => {
  close();
  currentDb = null;
});

async function applyNote(proposalId: string, next: string): Promise<number> {
  const res = await applyAiAction({ proposalId, task: 'test', action: { type: 'test.note', payload: next } });
  if (res.status !== 'applied') throw new Error(`not applied: ${res.reason}`);
  return res.activityId;
}

describe('AI activity', () => {
  it('applies with an activity row and an applied feedback row', async () => {
    const id = await applyNote('p1', 'ai version');
    expect(await noteText()).toBe('ai version');
    const [row] = await listAiActivity();
    expect(row).toMatchObject({
      id,
      proposalId: 'p1',
      kind: 'test.note',
      summary: 'Note → ai version',
      actor: 'app_ai',
      status: 'applied',
      before: { notes: 'original' },
    });
    expect(row?.deviceId).toMatch(/[0-9a-f-]{36}/);
    const fb = await currentDb!.getAllAsync<{ outcome: string }>('SELECT outcome FROM ai_feedback');
    expect(fb).toEqual([{ outcome: 'applied' }]);
  });

  it('reverts to before exactly once', async () => {
    const id = await applyNote('p1', 'ai version');
    expect(await revertAiActivity(id)).toBe('reverted');
    expect(await noteText()).toBe('original');
    expect(await revertAiActivity(id)).toBe('already_reverted');
    const [row] = await listAiActivity();
    expect(row?.status).toBe('reverted');
    expect(row?.revertedAt).toBeTypeOf('number');
  });

  it('a failed apply leaves no change, no activity, no feedback', async () => {
    fault.failOn = /INSERT INTO ai_activity/;
    await expect(applyNote('p1', 'ai version')).rejects.toThrow(/injected/);
    fault.failOn = null;
    expect(await noteText()).toBe('original');
    expect(await listAiActivity()).toEqual([]);
    expect(await currentDb!.getFirstAsync('SELECT 1 FROM ai_feedback')).toBeNull();
  });

  it('actions without revert are listed but not revertible', async () => {
    const res = await applyAiAction({ proposalId: 'p2', task: 'test', action: { type: 'test.one_way', payload: {} } });
    if (res.status !== 'applied') throw new Error('not applied');
    expect(await revertAiActivity(res.activityId)).toBe('not_revertible');
    expect(await revertAiActivity(999)).toBe('not_found');
  });

  it('records the external actor', async () => {
    await applyAiAction({ proposalId: 'p4', task: 'test', actor: 'mcp:claude', action: { type: 'test.note', payload: 'x' } });
    const [row] = await listAiActivity();
    expect(row?.actor).toBe('mcp:claude');
  });

  it.each([
    [{ type: 'test.missing', payload: 'x' }, undefined, 'unknown_action'],
    [{ type: 'test.note', payload: '' }, undefined, 'invalid_payload'],
    [{ type: 'test.note', payload: 'x' }, 'root' as never, 'invalid_actor'],
  ] as const)('rejects %o (actor %s) as %s and writes nothing', async (action, actor, reason) => {
    const res = await applyAiAction({ proposalId: 'p5', task: 'test', action, actor });
    expect(res).toMatchObject({ status: 'rejected', reason });
    expect(await noteText()).toBe('original');
    expect(await listAiActivity()).toEqual([]);
  });

  it('remote kill switches (task, actor prefix) reject before writing', async () => {
    await currentDb!.runAsync(
      `INSERT INTO kv (key, value) VALUES ('ai.flags', ?)`,
      JSON.stringify(['task:killed', 'actor:mcp:*']),
    );
    __resetAiFlagsForTests();
    const byTask = await applyAiAction({ proposalId: 'p6', task: 'killed', action: { type: 'test.note', payload: 'x' } });
    const byActor = await applyAiAction({
      proposalId: 'p7',
      task: 'test',
      actor: 'mcp:hermes',
      action: { type: 'test.note', payload: 'x' },
    });
    expect(byTask).toMatchObject({ status: 'rejected', reason: 'disabled' });
    expect(byActor).toMatchObject({ status: 'rejected', reason: 'disabled' });
    expect(await noteText()).toBe('original');
    const ok = await applyAiAction({ proposalId: 'p8', task: 'test', action: { type: 'test.note', payload: 'y' } });
    expect(ok.status).toBe('applied');
  });

  it('records rejected feedback without an activity row', async () => {
    await recordAiFeedback({ proposalId: 'p3', task: 'templates', outcome: 'rejected', reason: 'too_long' });
    expect(await listAiActivity()).toEqual([]);
    const fb = await currentDb!.getAllAsync<{ outcome: string; reason: string }>('SELECT outcome, reason FROM ai_feedback');
    expect(fb).toEqual([{ outcome: 'rejected', reason: 'too_long' }]);
  });
});

describe('AI activity retention', () => {
  it('keeps only the newest AI_FEEDBACK_KEEP feedback rows', async () => {
    const { AI_FEEDBACK_KEEP } = await import('../activity');
    for (let i = 0; i < AI_FEEDBACK_KEEP + 3; i++) {
      await currentDb!.runAsync(
        `INSERT INTO ai_feedback (proposal_id, task, outcome, created_at) VALUES (?, 't', 'rejected', 0)`,
        `old-${i}`,
      );
    }
    await recordAiFeedback({ proposalId: 'newest', task: 't', outcome: 'rejected' });
    const count = await currentDb!.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM ai_feedback');
    expect(count?.c).toBe(AI_FEEDBACK_KEEP);
    const last = await currentDb!.getFirstAsync<{ proposal_id: string }>(
      'SELECT proposal_id FROM ai_feedback ORDER BY id DESC LIMIT 1',
    );
    expect(last?.proposal_id).toBe('newest');
    expect(await currentDb!.getFirstAsync("SELECT 1 FROM ai_feedback WHERE proposal_id = 'old-0'")).toBeNull();
  });
});
