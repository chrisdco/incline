/**
 * Photo delete/retry durability (#147) and the storage readout (#193):
 * deletes cancel doomed transfers in their own transaction, failed jobs park
 * instead of being dropped, a retry re-arms them, and orphan files are found
 * without touching live or freshly written ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDbHandle } from './sqlite-adapter';

vi.mock('expo-crypto', () => {
  let n = 0;
  return {
    randomUUID: () => `test-uuid-${++n}`,
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    digestStringAsync: async () => 'deadbeef',
    digest: async () => new ArrayBuffer(0),
  };
});
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///tmp/',
  makeDirectoryAsync: async () => {},
  copyAsync: async () => {},
  deleteAsync: async () => {},
  getInfoAsync: async () => ({ exists: false }),
  readDirectoryAsync: async () => [],
}));
vi.mock('expo-file-system', () => ({
  File: class {},
  Directory: class {},
}));
vi.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));
vi.mock('@/db/account', () => ({ getLocalAccountOwner: async () => 'user-a' }));

const removeResult: { error: Error | null } = { error: new Error('storage down') };
vi.mock('@/sync/supabase-auth', () => ({
  getAuthedSupabase: async () => ({
    storage: { from: () => ({ remove: async () => removeResult }) },
  }),
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
vi.mock('@/db/client', () => ({
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

import { deleteWorkoutPhoto } from '../queries/photos';
import {
  formatPhotoStorage,
  getPhotoStorageStats,
  retryStuckPhotoTransfers,
} from '../queries/photo-storage';
import { PHOTO_BLOB_MAX_ATTEMPTS, drainPhotoBlobs } from '@/sync/photo-blobs';
import { ORPHAN_GRACE_MS, findOrphanPhotoFiles } from '@/sync/photo-orphans';
import { errorSignature, shouldReport } from '@/lib/error-dedupe';

let closeDb = () => {};

beforeEach(() => {
  removeResult.error = new Error('storage down');
  closeDb();
  const t = createTestDatabase({ failOn: null });
  currentDb = t.db;
  closeDb = t.close;
});

afterEach(() => {
  closeDb();
  currentDb = null;
});

function db(): TestDbHandle {
  if (!currentDb) throw new Error('test db not mounted');
  return currentDb;
}

async function seedPhoto(uuid: string, bytes: number, storagePath: string | null = null): Promise<number> {
  const log = await db().runAsync(
    `INSERT INTO workout_logs (name, started_at, ended_at, unit, uuid, created_at, updated_at)
     VALUES ('Push', 1, 2, 'metric', ?, 1, 1)`,
    `log-${uuid}`,
  );
  const photo = await db().runAsync(
    `INSERT INTO workout_photos (workout_log_id, uri, uuid, created_at, updated_at, byte_size, storage_path)
     VALUES (?, ?, ?, 1, 1, ?, ?)`,
    log.lastInsertRowId,
    `file:///tmp/workout-photos/${log.lastInsertRowId}/${uuid}.jpg`,
    uuid,
    bytes,
    storagePath,
  );
  return photo.lastInsertRowId;
}

async function queue(uuid: string) {
  return db().getAllAsync<{ op: string; attempts: number }>(
    'SELECT op, attempts FROM photo_blob_queue WHERE photo_uuid = ? ORDER BY id',
    uuid,
  );
}

describe('deleteWorkoutPhoto', () => {
  it('cancels a queued upload and queues the cloud delete in the same commit', async () => {
    const id = await seedPhoto('p1', 100);
    await db().runAsync(
      `INSERT INTO photo_blob_queue (photo_uuid, op, attempts, next_attempt_at, created_at) VALUES ('p1', 'upload', 2, 0, 1)`,
    );
    await deleteWorkoutPhoto(id);
    expect(await queue('p1')).toEqual([{ op: 'delete', attempts: 0 }]);
    const outbox = await db().getFirstAsync<{ op: string }>(
      "SELECT op FROM sync_outbox WHERE table_name = 'workout_photos' AND row_uuid = 'p1'",
    );
    expect(outbox?.op).toBe('delete');
  });
});

describe('photo transfer dead-letter', () => {
  it('parks a job after the last failed attempt instead of dropping it', async () => {
    await seedPhoto('p2', 100, 'user-a/log/p2.jpg');
    await db().runAsync(
      `INSERT INTO photo_blob_queue (photo_uuid, op, storage_path, attempts, next_attempt_at, created_at)
       VALUES ('p2', 'delete', 'user-a/log/p2.jpg', ?, 0, 1)`,
      PHOTO_BLOB_MAX_ATTEMPTS - 1,
    );
    await drainPhotoBlobs({ userId: 'user-a', getToken: async () => 'token' });
    expect(await queue('p2')).toEqual([{ op: 'delete', attempts: PHOTO_BLOB_MAX_ATTEMPTS }]);

    // Parked jobs are not picked up again, even once due.
    await db().runAsync('UPDATE photo_blob_queue SET next_attempt_at = 0');
    removeResult.error = null;
    await drainPhotoBlobs({ userId: 'user-a', getToken: async () => 'token' });
    expect(await queue('p2')).toHaveLength(1);

    expect((await getPhotoStorageStats()).stuck).toBe(1);
    expect(await retryStuckPhotoTransfers()).toBe(1);
    expect((await getPhotoStorageStats()).stuck).toBe(0);

    // Re-armed: the next drain succeeds and clears it.
    await drainPhotoBlobs({ userId: 'user-a', getToken: async () => 'token' });
    expect(await queue('p2')).toEqual([]);
  });
});

describe('storage readout', () => {
  it('sums live photos only, in one query', async () => {
    await seedPhoto('a', 1024 * 1024);
    const gone = await seedPhoto('b', 5 * 1024 * 1024);
    await db().runAsync('UPDATE workout_photos SET deleted_at = 1 WHERE id = ?', gone);
    const stats = await getPhotoStorageStats();
    expect(stats).toEqual({ count: 1, bytes: 1024 * 1024, stuck: 0 });
    expect(formatPhotoStorage(stats)).toBe('1 photo · 1.0 MB');
  });

  it('formats empty and large sizes', () => {
    expect(formatPhotoStorage({ count: 0, bytes: 0 })).toBe('No photos on this device');
    expect(formatPhotoStorage({ count: 40, bytes: 52.4 * 1024 * 1024 })).toBe('40 photos · 52 MB');
  });
});

describe('findOrphanPhotoFiles', () => {
  const now = 10 * ORPHAN_GRACE_MS;
  it('returns old unreferenced files only', () => {
    const files = [
      { uri: 'file:///tmp/workout-photos/1/live.jpg', modifiedMs: 0 },
      { uri: 'file:///tmp/workout-photos/1/orphan.jpg', modifiedMs: 0 },
      { uri: 'file:///tmp/workout-photos/2/fresh.jpg', modifiedMs: now - 1000 },
    ];
    const live = new Set(['file:///tmp/workout-photos/1/live.jpg']);
    expect(findOrphanPhotoFiles(files, live, now)).toEqual(['file:///tmp/workout-photos/1/orphan.jpg']);
  });
});

describe('error report dedupe (#191)', () => {
  it('reports a repeated render error once', () => {
    const seen = new Set<string>();
    const make = () => {
      const e = new Error('boom');
      e.stack = 'Error: boom\n    at Screen (screen.tsx:10:5)';
      return e;
    };
    expect(shouldReport(make(), seen)).toBe(true);
    expect(shouldReport(make(), seen)).toBe(false);
    expect(shouldReport(new Error('other'), seen)).toBe(true);
    expect(errorSignature('x')).toBe('non-error:x');
  });
});
