/**
 * Account-switch guard: prepareAccountSwitch must report pending outbox rows
 * so the gate can ask before phase 2 destroys them. Same account / fresh
 * claim never reports a switch.
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

vi.mock('@/lib/query-client', () => ({ queryClient: { clear: () => {} } }));
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///tmp/',
  deleteAsync: async () => {},
}));
vi.mock('@/store/active-workout-store', () => ({
  useActiveWorkout: { getState: () => ({ clear: () => {} }) },
}));
vi.mock('@/ai/byok', () => ({ resetAiSettings: async () => {} }));
vi.mock('@/store/settings-store', () => ({ resetAccountPreferences: () => {} }));
vi.mock('@/sync/supabase-auth', () => ({ clearAuthedSupabase: () => {} }));

import { completeAccountSwitch, prepareAccountSwitch } from '../account';

let closeDb = () => {};

function mountDb() {
  closeDb();
  const t = createTestDatabase({ failOn: null });
  currentDb = t.db;
  closeDb = t.close;
}

beforeEach(() => {
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

async function claim(owner: string) {
  await db().runAsync(
    'INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    'owner_user_id',
    owner,
  );
}

describe('prepareAccountSwitch', () => {
  it('claims fresh DBs without a switch', async () => {
    expect(await prepareAccountSwitch('user-a')).toEqual({ switched: false, pending: 0 });
  });

  it('reports no switch for the same owner', async () => {
    await claim('user-a');
    expect(await prepareAccountSwitch('user-a')).toEqual({ switched: false, pending: 0 });
  });

  it('counts pending outbox rows on switch', async () => {
    await claim('user-a');
    await db().runAsync(
      `INSERT INTO sync_outbox (table_name, row_uuid, op, payload, created_at, attempts)
       VALUES ('workout_logs', 'u1', 'upsert', '{}', 1, 0)`,
    );
    expect(await prepareAccountSwitch('user-b')).toEqual({ switched: true, pending: 1 });
  });

  it('counts queued photo uploads and deletes, not re-derivable downloads', async () => {
    await claim('user-a');
    for (const op of ['upload', 'delete', 'download']) {
      await db().runAsync(
        `INSERT INTO photo_blob_queue (photo_uuid, op, attempts, next_attempt_at, created_at)
         VALUES ('p1', ?, 0, 0, 1)`,
        op,
      );
    }
    expect(await prepareAccountSwitch('user-b')).toEqual({ switched: true, pending: 2 });
  });

  it('completing claims the new owner', async () => {
    await claim('user-a');
    await completeAccountSwitch('user-b');
    const row = await db().getFirstAsync<{ value: string }>(
      'SELECT value FROM schema_meta WHERE key = ?',
      'owner_user_id',
    );
    expect(row?.value).toBe('user-b');
    expect(await prepareAccountSwitch('user-b')).toEqual({ switched: false, pending: 0 });
  });
});
