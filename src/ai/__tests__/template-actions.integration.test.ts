/**
 * template.apply_diff against the real schema: one transaction moves the
 * routine to the approved rows, and Undo puts back exactly what was there
 * (rows, targets, rest, notes, order, name) — on built-in routines too.
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

import { applyAiAction, revertAiActivity } from '../activity';
import { __resetAiFlagsForTests } from '../flags';
import { registerTemplateActions, TEMPLATE_APPLY_DIFF } from '../template-actions';

let close: () => void;

const EXERCISES = [
  [1, 'Bench Press'],
  [2, 'Overhead Press'],
  [3, 'Lateral Raise'],
  [4, 'Landmine Press'],
  [5, 'Cable Fly'],
] as const;

const ROWS = [
  [11, 1, 0, 4, 6, 8, 180, 'pause on chest'],
  [12, 2, 1, 3, 8, 10, 120, ''],
  [13, 3, 2, 3, 12, 15, 60, ''],
] as const;

async function seed(db: TestDbHandle, custom: boolean) {
  for (const [id, name] of EXERCISES) {
    await db.runAsync(
      `INSERT INTO exercises (id, name, primary_muscle, movement_pattern, equipment, category, created_at, updated_at)
       VALUES (?, ?, 'chest', 'horizontal_push', 'barbell', 'strength', 1, 1)`,
      id,
      name,
    );
  }
  await db.runAsync(
    `INSERT INTO workout_templates (id, name, is_custom, uuid, created_at, updated_at) VALUES (1, 'Push B', ?, 'tpl-1', 1, 1)`,
    custom ? 1 : 0,
  );
  for (const [id, ex, order, sets, min, max, rest, notes] of ROWS) {
    await db.runAsync(
      `INSERT INTO template_exercises (id, template_id, exercise_id, sort_order, target_sets, target_reps_min, target_reps_max, rest_seconds, notes, uuid, updated_at)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      id, ex, order, sets, min, max, rest, notes, `te-${id}`,
    );
  }
}

async function live(db: TestDbHandle) {
  return db.getAllAsync<{ id: number; exercise_id: number; target_sets: number; rest_seconds: number; notes: string }>(
    `SELECT id, exercise_id, target_sets, target_reps_min, target_reps_max, rest_seconds, notes, sort_order
     FROM template_exercises WHERE template_id = 1 AND deleted_at IS NULL ORDER BY sort_order`,
  );
}

async function templateName(db: TestDbHandle) {
  const row = await db.getFirstAsync<{ name: string }>('SELECT name FROM workout_templates WHERE id = 1');
  return row?.name;
}

const payload = {
  templateId: 1,
  name: 'Push B (shoulders)',
  summary: 'Swap the press, drop raises, add flyes',
  rows: [
    { id: 11, exerciseId: 1, sets: 3, repsMin: 6, repsMax: 8 },
    { exerciseId: 5, sets: 2, repsMin: 12, repsMax: 15 },
    { id: 12, exerciseId: 4, sets: 3, repsMin: 8, repsMax: 10 },
  ],
};

beforeEach(() => {
  const t = createTestDatabase({ failOn: null });
  currentDb = t.db;
  close = t.close;
  __resetAiFlagsForTests();
  __resetDeviceIdForTests();
  registerTemplateActions();
});

afterEach(() => {
  close();
  currentDb = null;
});

describe.each([true, false])('template.apply_diff (custom=%s)', (custom) => {
  it('applies the approved rows and undo restores the routine exactly', async () => {
    const db = currentDb!;
    await seed(db, custom);
    const before = await live(db);

    const res = await applyAiAction({
      proposalId: 'p1',
      task: 'template_edit',
      action: { type: TEMPLATE_APPLY_DIFF, payload },
    });
    if (res.status !== 'applied') throw new Error(`not applied: ${JSON.stringify(res)}`);
    const after = await live(db);
    expect(after.map((r) => [r.exercise_id, r.target_sets])).toEqual([
      [1, 3],
      [5, 2],
      [4, 3],
    ]);
    // Kept rows keep their rest and notes.
    expect(after[0]).toMatchObject({ id: 11, rest_seconds: 180, notes: 'pause on chest' });
    expect(await templateName(db)).toBe('Push B (shoulders)');

    expect(await revertAiActivity(res.activityId)).toBe('reverted');
    expect(await live(db)).toEqual(before);
    expect(await templateName(db)).toBe('Push B');
    expect(await revertAiActivity(res.activityId)).toBe('already_reverted');
  });
});

describe('template.apply_diff payload', () => {
  it('rejects out-of-range targets, duplicate row ids and empty routines without writing', async () => {
    const db = currentDb!;
    await seed(db, true);
    const bad = [
      { ...payload, rows: [{ id: 11, exerciseId: 1, sets: 51, repsMin: 6, repsMax: 8 }] },
      { ...payload, rows: [payload.rows[0], payload.rows[0]] },
      { ...payload, rows: [] },
    ];
    for (const p of bad) {
      const res = await applyAiAction({
        proposalId: 'x',
        task: 'template_edit',
        action: { type: TEMPLATE_APPLY_DIFF, payload: p },
      });
      expect(res.status).toBe('rejected');
    }
    expect((await live(db)).length).toBe(3);
  });
});

describe('listExerciseNamesForAi', () => {
  it('puts logged exercises first, then custom, then the rest by name', async () => {
    const db = currentDb!;
    await seed(db, true);
    await db.runAsync(`UPDATE exercises SET is_custom = 1 WHERE id = 5`);
    await db.runAsync(`UPDATE exercises SET deleted_at = 1 WHERE id = 2`);
    await db.runAsync(`INSERT INTO workout_logs (id, name, started_at, created_at, updated_at) VALUES (1, 'Push', 1, 1, 1)`);
    await db.runAsync(
      `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, created_at, updated_at) VALUES (1, 3, 0, 1, 1)`,
    );
    const { listExerciseNamesForAi } = await import('@/db/queries/exercises');
    expect(await listExerciseNamesForAi()).toEqual(['Lateral Raise', 'Cable Fly', 'Bench Press', 'Landmine Press']);
    expect(await listExerciseNamesForAi(2)).toEqual(['Lateral Raise', 'Cable Fly']);
  });
});

describe('parseTemplateApplyPayload', () => {
  it('accepts kept rows outside the AI limits (12 sets, timed 0 reps)', async () => {
    const { parseTemplateApplyPayload } = await import('../template-actions');
    const rows = [{ id: 11, exerciseId: 1, sets: 12, repsMin: 0, repsMax: 0 }];
    expect(parseTemplateApplyPayload({ ...payload, rows }).ok).toBe(true);
  });
});

describe('template.create_copy', () => {
  it('saves a new routine, leaves the source alone, and undo removes the copy', async () => {
    const db = currentDb!;
    await seed(db, false);
    const { TEMPLATE_CREATE_COPY } = await import('../template-actions');
    const before = await live(db);
    const res = await applyAiAction({
      proposalId: 'copy-1',
      task: 'template_edit',
      action: { type: TEMPLATE_CREATE_COPY, payload: { ...payload, name: 'Push B (Home)' } },
    });
    expect(res.status).toBe('applied');
    if (res.status !== 'applied') return;
    const copyId = (res.after as { templateId: number }).templateId;
    expect(copyId).not.toBe(1);

    expect(await live(db)).toEqual(before);
    expect(await templateName(db)).toBe('Push B');
    const copy = await db.getFirstAsync<{ name: string; is_custom: number }>('SELECT name, is_custom FROM workout_templates WHERE id = ?', copyId);
    expect(copy).toEqual({ name: 'Push B (Home)', is_custom: 1 });
    const rows = await db.getAllAsync<{ exercise_id: number; target_sets: number; rest_seconds: number; notes: string }>(
      'SELECT exercise_id, target_sets, rest_seconds, notes FROM template_exercises WHERE template_id = ? AND deleted_at IS NULL ORDER BY sort_order',
      copyId,
    );
    // Row 11 carries its rest and notes over; the new row gets the default rest.
    expect(rows).toEqual([
      { exercise_id: 1, target_sets: 3, rest_seconds: 180, notes: 'pause on chest' },
      { exercise_id: 5, target_sets: 2, rest_seconds: 90, notes: '' },
      { exercise_id: 4, target_sets: 3, rest_seconds: 120, notes: '' },
    ]);

    expect(await revertAiActivity(res.activityId)).toBe('reverted');
    const gone = await db.getFirstAsync<{ deleted_at: number | null }>('SELECT deleted_at FROM workout_templates WHERE id = ?', copyId);
    expect(gone?.deleted_at).not.toBeNull();
    expect(await live(db)).toEqual(before);
  });
});
