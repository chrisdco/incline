/**
 * A workout's changes reaching its routine against the real schema
 * (docs/decisions/ROUTINE-CHANGES.md): update keeps rep ranges and notes,
 * every update saves the old shape, restore brings it back exactly (and can
 * itself be undone), and a copy leaves the original alone.
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

// sessions.ts (enqueueLogUpsert) pulls in photo storage; none of it runs here.
vi.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///tmp/' }));
vi.mock('@/sync/photo-blobs', () => ({
  checksumFile: async () => 'checksum',
  compressPhotoToJpeg: async () => '',
  enqueuePhotoBlob: async () => {},
  localPhotoPath: () => '',
}));

import { __resetDeviceIdForTests } from '@/lib/device-id';

import {
  getRoutineForSession,
  listTemplateVersions,
  MAX_TEMPLATE_VERSIONS,
  restoreTemplateVersion,
  saveWorkoutAsRoutineCopy,
  updateRoutineFromWorkout,
} from '../queries/routine-versions';

let close: () => void;

async function seed(db: TestDbHandle) {
  for (const [id, name] of [[1, 'Bench Press'], [2, 'Row'], [3, 'Dip']] as const) {
    await db.runAsync(
      `INSERT INTO exercises (id, name, primary_muscle, movement_pattern, equipment, category, created_at, updated_at)
       VALUES (?, ?, 'chest', 'horizontal_push', 'barbell', 'strength', 1, 1)`,
      id, name,
    );
  }
  await db.runAsync(
    `INSERT INTO workout_templates (id, name, is_custom, uuid, estimated_minutes, created_at, updated_at) VALUES (1, 'Push', 1, 'tpl-1', 50, 1, 1)`,
  );
  await db.runAsync(
    `INSERT INTO template_exercises (id, template_id, exercise_id, sort_order, target_sets, target_reps_min, target_reps_max, rest_seconds, notes, uuid, updated_at)
     VALUES (11, 1, 1, 0, 3, 5, 8, 180, 'pause reps', 'te-11', 1), (12, 1, 2, 1, 3, 8, 12, 90, '', 'te-12', 1)`,
  );
  await db.runAsync(
    `INSERT INTO workout_logs (id, template_id, name, started_at, ended_at, uuid, created_at, updated_at) VALUES (7, 1, 'Push', 1, 2, 'log-7', 1, 1)`,
  );
}

async function live(db: TestDbHandle, templateId = 1) {
  return db.getAllAsync<Record<string, unknown>>(
    `SELECT id, exercise_id, target_sets, target_reps_min, target_reps_max, rest_seconds, notes
     FROM template_exercises WHERE template_id = ? AND deleted_at IS NULL ORDER BY sort_order`,
    templateId,
  );
}

beforeEach(async () => {
  const t = createTestDatabase({ failOn: null });
  currentDb = t.db;
  close = t.close;
  __resetDeviceIdForTests();
  await seed(t.db);
});

afterEach(() => {
  close();
  currentDb = null;
});

const next = [
  { exerciseId: 1, sets: 4, restSeconds: 150 },
  { exerciseId: 3, sets: 2, repsMin: 8, repsMax: 12, restSeconds: 90 },
];

describe('routine updates from a workout', () => {
  it('reads the routine the finish prompt compares against', async () => {
    expect(await getRoutineForSession(1)).toEqual({
      templateId: 1,
      name: 'Push',
      estimatedMinutes: 50,
      slots: [
        { exerciseId: 1, name: 'Bench Press', sets: 3, restSeconds: 180 },
        { exerciseId: 2, name: 'Row', sets: 3, restSeconds: 90 },
      ],
    });
  });

  it('updates in place, keeps rep range and notes, and saves the old shape', async () => {
    const db = currentDb!;
    const applied = await updateRoutineFromWorkout(1, next, 'workout-update');
    expect(applied?.versionId).toEqual(expect.any(Number));
    const rows = await live(db);
    expect(rows).toMatchObject([
      { id: 11, exercise_id: 1, target_sets: 4, target_reps_min: 5, target_reps_max: 8, rest_seconds: 150, notes: 'pause reps' },
      { exercise_id: 3, target_sets: 2, target_reps_min: 8, target_reps_max: 12, rest_seconds: 90 },
    ]);
    const versions = await listTemplateVersions(1);
    expect(versions).toHaveLength(1);
    expect(versions[0].exercises).toEqual([{ name: 'Bench Press', sets: 3 }, { name: 'Row', sets: 3 }]);
    const outbox = await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM sync_outbox WHERE table_name LIKE 'user_template%'");
    expect(outbox?.c).toBeGreaterThan(0);
  });

  it('restores a version exactly, and the restore can be undone', async () => {
    const db = currentDb!;
    const before = await live(db);
    const applied = await updateRoutineFromWorkout(1, next, 'workout-update');
    const after = await live(db);
    expect(await restoreTemplateVersion(applied!.versionId!)).toBe(true);
    expect(await live(db)).toEqual(before);
    const versions = await listTemplateVersions(1);
    expect(versions[0].reason).toBe('restore');
    expect(await restoreTemplateVersion(versions[0].id)).toBe(true);
    expect((await live(db)).map((r) => [r.exercise_id, r.target_sets, r.rest_seconds])).toEqual(
      after.map((r) => [r.exercise_id, r.target_sets, r.rest_seconds]),
    );
  });

  it('keeps at most MAX_TEMPLATE_VERSIONS per routine', async () => {
    for (let i = 0; i < MAX_TEMPLATE_VERSIONS + 3; i++) {
      await updateRoutineFromWorkout(1, [{ exerciseId: 1, sets: 1 + (i % 5), restSeconds: 60 }], 'workout-rest');
    }
    expect(await listTemplateVersions(1)).toHaveLength(MAX_TEMPLATE_VERSIONS);
  });

  it('saves as a new routine, leaves the original and moves the log to the copy', async () => {
    const db = currentDb!;
    const before = await live(db);
    const copy = await saveWorkoutAsRoutineCopy(7, 1, next, 50);
    expect(copy?.name).toMatch(/^Push · /);
    expect(await live(db)).toEqual(before);
    expect(await live(db, copy!.templateId)).toMatchObject([
      { exercise_id: 1, target_sets: 4, target_reps_min: 5, target_reps_max: 8, rest_seconds: 150, notes: 'pause reps' },
      { exercise_id: 3, target_sets: 2, rest_seconds: 90 },
    ]);
    const log = await db.getFirstAsync<{ template_id: number }>('SELECT template_id FROM workout_logs WHERE id = 7');
    expect(log?.template_id).toBe(copy!.templateId);
  });
});
