/**
 * Crash safety of the write path + outbox (#137).
 *
 * A file-backed database is "killed" (connection closed with no COMMIT or
 * ROLLBACK — what SQLite sees when the process dies) before every statement
 * of a real write, then reopened. Invariant after every crash point: a set
 * whose updated_at moved past the last push has a pending outbox row carrying
 * that same updated_at. Otherwise pull LWW treats the unpushed local row as
 * newer and the edit never converges.
 *
 * A deliberately non-atomic writer (row UPDATE, then enqueue outside the
 * transaction — the #137 shape) runs through the same harness to prove the
 * harness catches the bug.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
  openWriterDatabase: async () => {
    if (!currentDb) throw new Error('test db not mounted');
    return currentDb;
  },
  isDatabaseReady: () => currentDb != null,
  __resetDatabaseCacheForTests: () => {},
}));

import { addExerciseToWorkout, addSet, startWorkout, updateSet } from '../queries/sessions';
import { enqueueSync } from '../../sync/outbox';

class Killed extends Error {}

let dir = '';
let closeDb = () => {};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'incline-crash-'));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1_000);
});

afterEach(() => {
  closeDb();
  currentDb = null;
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * Open `file` with a statement counter. Once armed, the `killAt`-th write
 * statement (0-based) kills the connection instead of running.
 */
function open(file: string, skipDdl: boolean) {
  closeDb();
  const counter = { armed: false, seen: 0, killAt: Infinity };
  const t = createTestDatabase({
    filename: file,
    skipDdl,
    beforeStatement: () => {
      if (!counter.armed) return;
      if (counter.seen++ === counter.killAt) {
        t.crash();
        throw new Killed('process killed');
      }
    },
  });
  currentDb = t.db;
  closeDb = t.close;
  return counter;
}

/** One workout, one set; outbox drained as if everything was pushed. */
async function baseline(file: string, opts: { drain: boolean }) {
  const counter = open(file, false);
  await currentDb!.runAsync(
    `INSERT INTO exercises (id, name, primary_muscle, movement_pattern, equipment, category, created_at, updated_at)
     VALUES (1, 'Bench', 'chest', 'horizontal_push', 'barbell', 'strength', 1, 1)`,
  );
  const logId = await startWorkout(null, 'Push');
  await addExerciseToWorkout(logId, 1);
  const setId = await addSet(logId, 1);
  if (opts.drain) await currentDb!.runAsync('DELETE FROM sync_outbox');
  vi.setSystemTime(5_000);
  return { counter, setId };
}

async function assertConverges(file: string, setId: number) {
  closeDb();
  open(file, true);
  const set = await currentDb!.getFirstAsync<{ uuid: string; weight: number | null; updated_at: number }>(
    'SELECT uuid, weight, updated_at FROM set_entries WHERE id = ?',
    setId,
  );
  const pending = await currentDb!.getFirstAsync<{ payload: string }>(
    "SELECT payload FROM sync_outbox WHERE table_name = 'set_entries' AND row_uuid = ?",
    set!.uuid,
  );
  if (set!.updated_at === 5_000) {
    // The edit survived: it must be queued, with the matching version.
    expect(pending, 'edit committed without its outbox row').not.toBeNull();
    expect(JSON.parse(pending!.payload)).toMatchObject({ weight: 100, updated_at: 5_000 });
  } else if (pending) {
    // Rolled back: whatever is queued must describe the row as it stands.
    expect(JSON.parse(pending.payload).updated_at).toBe(set!.updated_at);
  }
}

/** Kill before each statement in turn; returns how many crash points there were. */
async function killEverywhere(write: (setId: number) => Promise<void>, opts: { drain: boolean }) {
  const dry = path.join(dir, 'dry.db');
  const probe = await baseline(dry, opts);
  probe.counter.armed = true;
  await write(probe.setId);
  const statements = probe.counter.seen;
  closeDb();
  expect(statements).toBeGreaterThan(1);

  for (let killAt = 0; killAt < statements; killAt++) {
    const file = path.join(dir, `kill-${killAt}.db`);
    vi.setSystemTime(1_000);
    const { counter, setId } = await baseline(file, opts);
    counter.armed = true;
    counter.killAt = killAt;
    await expect(write(setId)).rejects.toBeInstanceOf(Killed);
    await assertConverges(file, setId);
  }
  return statements;
}

describe('crash between statements (#137)', () => {
  it('updateSet: the edit and its outbox row survive or vanish together (outbox drained)', async () => {
    await killEverywhere((setId) => updateSet(setId, { weight: 100 }), { drain: true });
  });

  it('updateSet: coalescing onto a pending row is just as safe', async () => {
    await killEverywhere((setId) => updateSet(setId, { weight: 100 }), { drain: false });
  });

  it('the harness catches a non-atomic writer (the pre-#137 shape)', async () => {
    const nonAtomic = async (setId: number) => {
      const db = currentDb!;
      await db.runAsync('UPDATE set_entries SET weight = 100, updated_at = 5000 WHERE id = ?', setId);
      const row = await db.getFirstAsync<{ uuid: string }>('SELECT uuid FROM set_entries WHERE id = ?', setId);
      await enqueueSync('set_entries', row!.uuid, 'upsert', { weight: 100, updated_at: 5_000 });
    };
    await expect(killEverywhere(nonAtomic, { drain: true })).rejects.toThrow(
      /edit committed without its outbox row/,
    );
  });
});
