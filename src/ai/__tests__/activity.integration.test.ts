/**
 * AI activity log: apply writes the change + activity + feedback atomically,
 * revert restores `before` exactly once, and a failing apply leaves nothing.
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

import {
  applyAiChange,
  listAiActivity,
  recordAiFeedback,
  registerRevertHandler,
  revertAiActivity,
} from '../activity';

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

registerRevertHandler('test.note', {
  tables: ['session_exercise_notes'],
  revert: async (tx, before) => setNote(tx as TestDbHandle, (before as Note).notes),
});

let close: () => void;
const fault = { failOn: null as RegExp | null };

beforeEach(async () => {
  const t = createTestDatabase(fault);
  currentDb = t.db;
  close = t.close;
  fault.failOn = null;
  await setNote(t.db, 'original');
});

afterEach(() => {
  close();
  currentDb = null;
});

function applyNote(proposalId: string, next: string) {
  return applyAiChange({
    proposalId,
    task: 'test',
    kind: 'test.note',
    summary: `Note → ${next}`,
    tables: ['session_exercise_notes'],
    apply: async (tx) => {
      const before = { notes: (await noteText()) ?? '' };
      await setNote(tx as TestDbHandle, next);
      return { before, after: { notes: next } };
    },
  });
}

describe('AI activity', () => {
  it('applies with an activity row and an applied feedback row', async () => {
    const id = await applyNote('p1', 'ai version');
    expect(await noteText()).toBe('ai version');
    const [row] = await listAiActivity();
    expect(row).toMatchObject({ id, proposalId: 'p1', kind: 'test.note', status: 'applied', before: { notes: 'original' } });
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

  it('kinds without a revert handler are listed but not revertible', async () => {
    const id = await applyAiChange({
      proposalId: 'p2',
      task: 'test',
      kind: 'test.unknown',
      summary: 'x',
      tables: [],
      apply: async () => ({ before: null, after: null }),
    });
    expect(await revertAiActivity(id)).toBe('not_revertible');
    expect(await revertAiActivity(999)).toBe('not_found');
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
