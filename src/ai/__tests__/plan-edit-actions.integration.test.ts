/**
 * program.apply_edit against the real schema: one transaction moves the plan
 * to the approved slots, weeks, name and swaps; Undo puts back exactly what
 * was there (slot ids included), and the outbox gets every change.
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
import { PROGRAM_APPLY_EDIT, registerPlanActions } from '../plan-actions';

let close: () => void;

async function seed(db: TestDbHandle) {
  for (const [id, name] of [
    [1, 'Bench Press'],
    [2, 'Back Squat'],
    [3, 'Front Squat'],
  ] as const) {
    await db.runAsync(
      `INSERT INTO exercises (id, name, primary_muscle, movement_pattern, equipment, category, created_at, updated_at)
       VALUES (?, ?, 'chest', 'horizontal_push', 'barbell', 'strength', 1, 1)`,
      id, name,
    );
  }
  for (const [id, name] of [
    [1, 'Upper'],
    [2, 'Lower'],
  ] as const) {
    await db.runAsync(
      `INSERT INTO workout_templates (id, name, is_custom, uuid, created_at, updated_at) VALUES (?, ?, 1, ?, 1, 1)`,
      id, name, `tpl-${id}`,
    );
    await db.runAsync(
      `INSERT INTO template_exercises (id, template_id, exercise_id, sort_order, target_sets, target_reps_min, target_reps_max, rest_seconds, notes, uuid, updated_at)
       VALUES (?, ?, ?, 0, 3, 5, 8, 150, 'keep me', ?, 1)`,
      id * 10, id, id, `te-${id}`,
    );
  }
  await db.runAsync(
    `INSERT INTO programs (id, name, description, weeks, is_custom, uuid, created_at, updated_at) VALUES (7, 'Winter Arc', '', 2, 1, 'prog-7', 1, 1)`,
  );
  let slot = 100;
  for (const week of [1, 2]) {
    for (const [day, tpl] of [
      [1, 1],
      [4, 2],
    ] as const) {
      await db.runAsync(
        `INSERT INTO program_workouts (id, program_id, template_id, week, day, sort_order, uuid, updated_at) VALUES (?, 7, ?, ?, ?, 0, ?, 1)`,
        slot, tpl, week, day, `pw-${slot}`,
      );
      slot++;
    }
  }
}

async function state(db: TestDbHandle) {
  const program = await db.getFirstAsync<{ name: string; weeks: number }>('SELECT name, weeks FROM programs WHERE id = 7');
  const slots = await db.getAllAsync<{ id: number; week: number; day: number; template_id: number }>(
    'SELECT id, week, day, template_id FROM program_workouts WHERE program_id = 7 AND deleted_at IS NULL ORDER BY week, day',
  );
  const lower = await db.getAllAsync<{ id: number; exercise_id: number; notes: string }>(
    'SELECT id, exercise_id, notes FROM template_exercises WHERE template_id = 2 AND deleted_at IS NULL',
  );
  return { program, slots, lower };
}

const payload = {
  programId: 7,
  name: 'Winter Arc+',
  weeks: 3,
  summary: 'Lower on Friday, one more week, front squats',
  slots: [1, 2, 3].flatMap((week) => [
    { week, day: 1, templateId: 1 },
    { week, day: 5, templateId: 2 },
  ]),
  swaps: [{ templateId: 2, fromExerciseId: 2, toExerciseId: 3 }],
};

beforeEach(() => {
  const t = createTestDatabase({ failOn: null });
  currentDb = t.db;
  close = t.close;
  __resetAiFlagsForTests();
  __resetDeviceIdForTests();
  registerPlanActions();
});

afterEach(() => {
  close();
  currentDb = null;
});

describe('program.apply_edit', () => {
  it('applies the approved plan and undo restores it exactly', async () => {
    const db = currentDb!;
    await seed(db);
    const before = await state(db);

    const res = await applyAiAction({ proposalId: 'p1', task: 'plan_edit', action: { type: PROGRAM_APPLY_EDIT, payload } });
    if (res.status !== 'applied') throw new Error(`not applied: ${JSON.stringify(res)}`);
    const after = await state(db);
    expect(after.program).toEqual({ name: 'Winter Arc+', weeks: 3 });
    expect(after.slots.map((s) => [s.week, s.day, s.template_id])).toEqual([
      [1, 1, 1],
      [1, 5, 2],
      [2, 1, 1],
      [2, 5, 2],
      [3, 1, 1],
      [3, 5, 2],
    ]);
    // Unchanged slots keep their ids; swapped rows keep rest and notes.
    expect(after.slots[0]!.id).toBe(100);
    expect(after.lower).toEqual([{ id: 20, exercise_id: 3, notes: 'keep me' }]);
    const outbox = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM sync_outbox WHERE table_name = 'user_program_workouts'",
    );
    expect(outbox?.n).toBeGreaterThanOrEqual(6);

    expect(await revertAiActivity(res.activityId)).toBe('reverted');
    expect(await state(db)).toEqual(before);
  });

  it('rejects a slot past the plan length and built-in programs without writing', async () => {
    const db = currentDb!;
    await seed(db);
    const before = await state(db);
    const bad = await applyAiAction({
      proposalId: 'p2',
      task: 'plan_edit',
      action: { type: PROGRAM_APPLY_EDIT, payload: { ...payload, slots: [{ week: 4, day: 1, templateId: 1 }] } },
    });
    expect(bad.status).not.toBe('applied');
    await db.runAsync('UPDATE programs SET is_custom = 0 WHERE id = 7');
    await expect(
      applyAiAction({ proposalId: 'p3', task: 'plan_edit', action: { type: PROGRAM_APPLY_EDIT, payload } }),
    ).rejects.toThrow('program not found');
    await db.runAsync('UPDATE programs SET is_custom = 1 WHERE id = 7');
    expect(await state(db)).toEqual(before);
  });
});
