/**
 * Integration tests for the write path (Batch B): the REAL query modules
 * (sessions, outbox) run against the REAL current schema via a better-sqlite3
 * adapter standing in for expo-sqlite. Native modules are mocked at the
 * boundary (crypto ids, file system, photo blobs).
 *
 * Fault injection (faults.failOn) proves transaction atomicity: a throw
 * mid-finish/discard must roll back everything, not strand half-states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDbHandle } from './sqlite-adapter';

vi.mock('expo-crypto', () => {
  let n = 0;
  return {
    randomUUID: () => `test-uuid-${++n}`,
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    digestStringAsync: async () => 'deadbeef',
  };
});

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///tmp/',
  makeDirectoryAsync: async () => {},
  copyAsync: async () => {},
  deleteAsync: async () => {},
  getInfoAsync: async () => ({ exists: false }),
}));

vi.mock('@/sync/photo-blobs', () => ({
  checksumFile: async () => 'checksum',
  compressPhotoToJpeg: async () => 'file:///tmp/compressed.jpg',
  enqueuePhotoBlob: async () => {},
  localPhotoPath: () => 'file:///tmp/photo.jpg',
}));

let currentDb: TestDbHandle | null = null;

vi.mock('../client', () => ({
  openDatabase: async () => {
    if (!currentDb) throw new Error('test db not mounted');
    return currentDb;
  },
  isDatabaseReady: () => currentDb != null,
  __resetDatabaseCacheForTests: () => {},
}));

import {
  addExerciseToWorkout,
  discardWorkout,
  finishWorkout,
  getWorkoutLog,
  removeExerciseFromWorkout,
  removeSet,
  reorderWorkoutExercises,
  replaceExerciseInWorkout,
  restoreSet,
  startWorkout,
  updateSet,
  updateWorkoutDuration,
} from '../queries/sessions';
import { enqueueSync } from '../../sync/outbox';

const faults: { failOn: RegExp | null } = { failOn: null };
let closeDb = () => {};

function mountDb() {
  closeDb();
  const t = createTestDatabase(faults);
  currentDb = t.db;
  closeDb = t.close;
}

beforeEach(() => {
  faults.failOn = null;
  mountDb();
});

afterEach(() => {
  closeDb();
  currentDb = null;
});

function db(): TestDbHandle {
  if (!currentDb) throw new Error('test db not mounted');
  return currentDb;
}

async function seedExercise(id: number, name = `Ex ${id}`) {
  await db().runAsync(
    `INSERT INTO exercises (id, name, primary_muscle, movement_pattern, equipment, category, created_at, updated_at)
     VALUES (?, ?, 'chest', 'horizontal_push', 'barbell', 'strength', 1, 1)`,
    id,
    name,
  );
}

async function setIds(logId: number): Promise<number[]> {
  const rows = await db().getAllAsync<{ id: number }>(
    'SELECT id FROM set_entries WHERE workout_log_id = ? AND deleted_at IS NULL ORDER BY id',
    logId,
  );
  return rows.map((r) => r.id);
}

async function openLogCount(): Promise<number> {
  const row = await db().getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM workout_logs WHERE ended_at IS NULL AND deleted_at IS NULL',
  );
  return row?.c ?? 0;
}

async function outboxCount(): Promise<number> {
  const row = await db().getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM sync_outbox');
  return row?.c ?? 0;
}

describe('startWorkout concurrency', () => {
  it('coalesces concurrent same-workout starts onto one log', async () => {
    const [a, b] = await Promise.all([startWorkout(null, 'A'), startWorkout(null, 'A')]);
    expect(a).toBe(b);
    expect(await openLogCount()).toBe(1);
  });

  it('lets genuinely different starts through', async () => {
    const [a, b] = await Promise.all([startWorkout(null, 'A'), startWorkout(null, 'B')]);
    expect(a).not.toBe(b);
    expect(await openLogCount()).toBe(2);
  });
});

describe('finishWorkout atomicity', () => {
  it('rolls back tombstones when the close fails', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);
    const [id] = await setIds(logId);
    await updateSet(id, { completed: true, weight: 80, reps: 8 });
    const outboxBefore = await outboxCount();

    faults.failOn = /UPDATE workout_logs SET ended_at/;
    await expect(finishWorkout(logId)).rejects.toThrow('injected fault');
    faults.failOn = null;

    const sets = await db().getAllAsync<{ deleted_at: number | null }>(
      'SELECT deleted_at FROM set_entries WHERE workout_log_id = ?',
      logId,
    );
    expect(sets.every((s) => s.deleted_at == null)).toBe(true);
    const log = await db().getFirstAsync<{ ended_at: number | null }>(
      'SELECT ended_at FROM workout_logs WHERE id = ?',
      logId,
    );
    expect(log?.ended_at).toBeNull();
    // No partial outbox rows from the failed finish (only setup rows remain).
    expect(await outboxCount()).toBe(outboxBefore);
  });

  it('closes the log, tombstones incompletes and enqueues exactly once per row', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);
    await addExerciseToWorkout(logId, 1);
    const [first, second] = await setIds(logId);
    await updateSet(first, { completed: true, weight: 80, reps: 8 });

    await finishWorkout(logId);

    const log = await db().getFirstAsync<{ ended_at: number | null; total_volume: number }>(
      'SELECT ended_at, total_volume FROM workout_logs WHERE id = ?',
      logId,
    );
    expect(log?.ended_at).not.toBeNull();
    expect(log?.total_volume).toBe(640);
    const gone = await db().getFirstAsync<{ deleted_at: number | null }>(
      'SELECT deleted_at FROM set_entries WHERE id = ?',
      second,
    );
    expect(gone?.deleted_at).not.toBeNull();
    // One outbox row per uuid despite multiple edits (coalesce contract).
    const outbox = await db().getAllAsync<{ row_uuid: string }>('SELECT row_uuid FROM sync_outbox');
    expect(new Set(outbox.map((r) => r.row_uuid)).size).toBe(outbox.length);
    expect(outbox.length).toBeGreaterThan(0);
  });
});

describe('discardWorkout atomicity', () => {
  it('keeps log and sets alive when the log delete fails', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);

    faults.failOn = /UPDATE workout_logs SET deleted_at/;
    await expect(discardWorkout(logId)).rejects.toThrow('injected fault');
    faults.failOn = null;

    const sets = await db().getAllAsync<{ deleted_at: number | null }>(
      'SELECT deleted_at FROM set_entries WHERE workout_log_id = ?',
      logId,
    );
    expect(sets.every((s) => s.deleted_at == null)).toBe(true);
    expect(await openLogCount()).toBe(1);
  });
});

describe('updateWorkoutDuration guard', () => {
  it('refuses open logs and applies to finished ones', async () => {
    const logId = await startWorkout(null, 'Push');
    expect(await updateWorkoutDuration(logId, 3600)).toBe(false);
    const open = await db().getFirstAsync<{ ended_at: number | null }>(
      'SELECT ended_at FROM workout_logs WHERE id = ?',
      logId,
    );
    expect(open?.ended_at).toBeNull();

    await finishWorkout(logId);
    expect(await updateWorkoutDuration(logId, 3600)).toBe(true);
    const closed = await db().getFirstAsync<{ duration_seconds: number }>(
      'SELECT duration_seconds FROM workout_logs WHERE id = ?',
      logId,
    );
    expect(closed?.duration_seconds).toBe(3600);
  });
});

describe('exercise-level ops', () => {
  it('removes, replaces and reorders through getWorkoutLog order', async () => {
    await seedExercise(1, 'Bench');
    await seedExercise(2, 'Squat');
    await seedExercise(3, 'Row');
    const logId = await startWorkout(null, 'Full');
    await addExerciseToWorkout(logId, 1);
    await addExerciseToWorkout(logId, 2);

    const removed = await removeExerciseFromWorkout(logId, 2);
    expect(removed.removed).toBe(1);
    let session = await getWorkoutLog(logId);
    expect(session?.sets.map((s) => s.exerciseId)).toEqual([1]);

    await addExerciseToWorkout(logId, 2);
    await addExerciseToWorkout(logId, 3);
    await reorderWorkoutExercises(logId, [3, 2, 1]);
    session = await getWorkoutLog(logId);
    expect(session?.sets.map((s) => s.exerciseId)).toEqual([3, 2, 1]);

    // Complete a set on 3, then replace 2: completed work on 3 stays put.
    const three = session?.sets.find((s) => s.exerciseId === 3);
    await updateSet(three!.id, { completed: true, weight: 60, reps: 10 });
    await replaceExerciseInWorkout(logId, 2, 1);
    session = await getWorkoutLog(logId);
    const ids = session?.sets.map((s) => s.exerciseId) ?? [];
    expect(ids).toContain(3);
    expect(ids).not.toContain(2);
  });

  it('restores a removed set', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);
    const [id] = await setIds(logId);
    await removeSet(id);
    expect(await setIds(logId)).toEqual([]);
    await restoreSet(id);
    expect(await setIds(logId)).toEqual([id]);
  });
});

describe('outbox coalesce (real module)', () => {
  it('keeps the latest payload and resets attempts', async () => {
    await enqueueSync('set_entries', 'uuid-1', 'upsert', { reps: 8 });
    await enqueueSync('set_entries', 'uuid-1', 'upsert', { reps: 10 });
    const rows = await db().getAllAsync<{ payload: string; attempts: number }>(
      'SELECT payload, attempts FROM sync_outbox WHERE row_uuid = ?',
      'uuid-1',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toBe('{"reps":10}');
    expect(rows[0].attempts).toBe(0);
  });
});
