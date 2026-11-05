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
      { ...payload, rows: [{ id: 11, exerciseId: 1, sets: 11, repsMin: 6, repsMax: 8 }] },
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
