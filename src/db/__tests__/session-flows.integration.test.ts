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
  // Same handle: the adapter is one connection, mutate() BEGINs on it.
  openWriterDatabase: async () => {
    if (!currentDb) throw new Error('test db not mounted');
    return currentDb;
  },
  isDatabaseReady: () => currentDb != null,
  __resetDatabaseCacheForTests: () => {},
}));

import { onTablesChanged } from '../changes';
import {
  addExerciseToWorkout,
  addSet,
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
import { volatileKey } from '../../lib/session-volatile';

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

describe('finish / discard / remove are one transaction each (#141)', () => {
  async function seedVolatile(logId: number) {
    await db().runAsync('INSERT INTO kv (key, value) VALUES (?, ?)', volatileKey(logId), '{"pausedAt":1}');
  }

  async function hasVolatile(logId: number): Promise<boolean> {
    const row = await db().getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM kv WHERE key = ?',
      volatileKey(logId),
    );
    return (row?.c ?? 0) > 0;
  }

  async function logRow(logId: number) {
    return db().getFirstAsync<{ ended_at: number | null; deleted_at: number | null; notes: string }>(
      'SELECT ended_at, deleted_at, notes FROM workout_logs WHERE id = ?',
      logId,
    );
  }

  it('finish writes notes, closes the log and drops volatile kv together', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);
    const [id] = await setIds(logId);
    await updateSet(id, { completed: true, weight: 80, reps: 8 });
    await seedVolatile(logId);

    await finishWorkout(logId, { notes: 'felt strong' });

    const log = await logRow(logId);
    expect(log?.ended_at).not.toBeNull();
    expect(log?.notes).toBe('felt strong');
    expect(await hasVolatile(logId)).toBe(false);
  });

  it('finish without notes keeps the saved ones', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await db().runAsync("UPDATE workout_logs SET notes = 'kept' WHERE id = ?", logId);

    await finishWorkout(logId);

    expect((await logRow(logId))?.notes).toBe('kept');
  });

  it('a failed finish enqueue rolls back notes, close and kv', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);
    await addExerciseToWorkout(logId, 1);
    const [first] = await setIds(logId);
    await updateSet(first, { completed: true, weight: 80, reps: 8 });
    await seedVolatile(logId);
    const outboxBefore = await outboxCount();

    faults.failOn = /INSERT INTO sync_outbox/;
    await expect(finishWorkout(logId, { notes: 'lost' })).rejects.toThrow('injected fault');
    faults.failOn = null;

    const log = await logRow(logId);
    expect(log?.ended_at).toBeNull();
    expect(log?.notes).toBe('');
    expect(await setIds(logId)).toHaveLength(2);
    expect(await hasVolatile(logId)).toBe(true);
    expect(await outboxCount()).toBe(outboxBefore);
  });

  it('discard drops volatile kv in the same commit, and keeps it on failure', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);
    await seedVolatile(logId);

    faults.failOn = /INSERT INTO sync_outbox/;
    await expect(discardWorkout(logId)).rejects.toThrow('injected fault');
    faults.failOn = null;
    expect((await logRow(logId))?.deleted_at).toBeNull();
    expect(await setIds(logId)).toHaveLength(1);
    expect(await hasVolatile(logId)).toBe(true);

    await discardWorkout(logId);
    expect((await logRow(logId))?.deleted_at).not.toBeNull();
    expect(await setIds(logId)).toHaveLength(0);
    expect(await hasVolatile(logId)).toBe(false);
  });

  it('a failed remove enqueue keeps every set of the exercise', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);
    await addSet(logId, 1);
    const before = await setIds(logId);
    const outboxBefore = await outboxCount();

    faults.failOn = /INSERT INTO sync_outbox/;
    await expect(removeExerciseFromWorkout(logId, 1)).rejects.toThrow('injected fault');
    faults.failOn = null;

    expect(await setIds(logId)).toEqual(before);
    expect(await outboxCount()).toBe(outboxBefore);
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
    expect(removed.setIds).toHaveLength(1);
    let session = await getWorkoutLog(logId);
    expect(session?.sets.map((s) => s.exerciseId)).toEqual([1]);

    // Undo path (what the toast action drives): restore every removed set.
    for (const setId of removed.setIds) {
      await restoreSet(setId);
    }
    session = await getWorkoutLog(logId);
    expect(session?.sets.map((s) => s.exerciseId).sort()).toEqual([1, 2]);

    // Back to the pre-undo state for the reorder/replace checks below.
    await removeExerciseFromWorkout(logId, 2);
    session = await getWorkoutLog(logId);
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

  it('keeps the replaced exercise in its slot (#169)', async () => {
    await seedExercise(1);
    await seedExercise(2);
    await seedExercise(3);
    await seedExercise(4);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);
    await addExerciseToWorkout(logId, 2);
    await addExerciseToWorkout(logId, 3);
    // Nothing completed on 2: every old set drops, the slot must survive.
    await replaceExerciseInWorkout(logId, 2, 4);
    let session = await getWorkoutLog(logId);
    expect([...new Set(session?.sets.map((s) => s.exerciseId))]).toEqual([1, 4, 3]);

    // Completed work on the old exercise stays, directly after the replacement.
    const one = session?.sets.find((s) => s.exerciseId === 1);
    await updateSet(one!.id, { completed: true, weight: 50, reps: 5 });
    await replaceExerciseInWorkout(logId, 1, 2);
    session = await getWorkoutLog(logId);
    expect([...new Set(session?.sets.map((s) => s.exerciseId))]).toEqual([2, 1, 4, 3]);
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

describe('mutate(): a failed enqueue rolls back the row change (#138)', () => {
  const failEnqueue = /INSERT INTO sync_outbox/;

  it('updateSet leaves the set untouched and rethrows', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);
    const [id] = await setIds(logId);
    const outboxBefore = await outboxCount();

    faults.failOn = failEnqueue;
    await expect(updateSet(id, { completed: true, weight: 100, reps: 5 })).rejects.toThrow(
      'injected fault',
    );
    faults.failOn = null;

    const row = await db().getFirstAsync<{ weight: number; completed: number }>(
      'SELECT weight, completed FROM set_entries WHERE id = ?',
      id,
    );
    expect(row).toEqual({ weight: 0, completed: 0 });
    expect(await outboxCount()).toBe(outboxBefore);
  });

  it('addSet inserts nothing', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);
    const before = await setIds(logId);

    faults.failOn = failEnqueue;
    await expect(addSet(logId, 1)).rejects.toThrow('injected fault');
    faults.failOn = null;

    expect(await setIds(logId)).toEqual(before);
  });

  it('removeSet keeps the set alive', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);
    const [id] = await setIds(logId);

    faults.failOn = failEnqueue;
    await expect(removeSet(id)).rejects.toThrow('injected fault');
    faults.failOn = null;

    expect(await setIds(logId)).toEqual([id]);
  });

  it('startWorkout opens no log', async () => {
    faults.failOn = failEnqueue;
    await expect(startWorkout(null, 'Push')).rejects.toThrow('injected fault');
    faults.failOn = null;

    expect(await openLogCount()).toBe(0);
  });

  it('later writes still commit after a rollback', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);
    const [id] = await setIds(logId);

    faults.failOn = failEnqueue;
    await expect(updateSet(id, { reps: 3 })).rejects.toThrow('injected fault');
    faults.failOn = null;
    await updateSet(id, { reps: 7 });

    const row = await db().getFirstAsync<{ reps: number }>('SELECT reps FROM set_entries WHERE id = ?', id);
    expect(row?.reps).toBe(7);
  });
});

describe('stored total_volume settles at finish, not per edit', () => {
  it('leaves an open log untouched on set edits, then settles on finish', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);
    const [id] = await setIds(logId);
    const logBefore = await db().getFirstAsync<{ total_volume: number; updated_at: number }>(
      'SELECT total_volume, updated_at FROM workout_logs WHERE id = ?',
      logId,
    );

    await updateSet(id, { completed: true, weight: 100, reps: 5 });

    const logAfter = await db().getFirstAsync<{ total_volume: number; updated_at: number }>(
      'SELECT total_volume, updated_at FROM workout_logs WHERE id = ?',
      logId,
    );
    expect(logAfter).toEqual(logBefore);

    await finishWorkout(logId);
    const closed = await db().getFirstAsync<{ total_volume: number }>(
      'SELECT total_volume FROM workout_logs WHERE id = ?',
      logId,
    );
    expect(closed?.total_volume).toBe(500);
  });

  it('recomputes and re-enqueues a finished log when its sets change', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);
    const [id] = await setIds(logId);
    await updateSet(id, { completed: true, weight: 100, reps: 5 });
    await finishWorkout(logId);

    await updateSet(id, { reps: 6 });
    const log = await db().getFirstAsync<{ total_volume: number; uuid: string }>(
      'SELECT total_volume, uuid FROM workout_logs WHERE id = ?',
      logId,
    );
    expect(log?.total_volume).toBe(600);
    const queued = await db().getFirstAsync<{ payload: string }>(
      'SELECT payload FROM sync_outbox WHERE row_uuid = ?',
      log!.uuid,
    );
    expect(JSON.parse(queued!.payload).total_volume).toBe(600);

    await removeSet(id);
    const emptied = await db().getFirstAsync<{ total_volume: number }>(
      'SELECT total_volume FROM workout_logs WHERE id = ?',
      logId,
    );
    expect(emptied?.total_volume).toBe(0);
  });
});

describe('table-change event', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('emits the written tables once per commit and nothing on rollback', async () => {
    await seedExercise(1);
    const logId = await startWorkout(null, 'Push');
    await addExerciseToWorkout(logId, 1);
    const [id] = await setIds(logId);
    await tick();

    const seen: string[][] = [];
    const off = onTablesChanged((tables) => seen.push([...tables].sort()));
    try {
      await updateSet(id, { reps: 4 });
      await tick();
      expect(seen).toEqual([['set_entries', 'sync_outbox', 'workout_logs']]);

      faults.failOn = /INSERT INTO sync_outbox/;
      await expect(updateSet(id, { reps: 5 })).rejects.toThrow('injected fault');
      faults.failOn = null;
      await tick();
      expect(seen).toHaveLength(1);
    } finally {
      off();
    }
  });
});
