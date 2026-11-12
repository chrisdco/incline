/**
 * The one local reset path (#145, #146): sign-out, account switch, deletion,
 * error-boundary recovery and dev tools all run resetUserData. These tests
 * pin everything it must clear, what it must keep, and the owner handling
 * that distinguishes sign-out (release) from switch (claim).
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

const calls: string[] = [];

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///tmp/',
  deleteAsync: async (uri: string) => {
    calls.push(`files:${uri}`);
  },
}));
vi.mock('@/lib/query-client', () => ({
  queryClient: { clear: () => calls.push('queryClient.clear') },
}));
vi.mock('@/store/active-workout-store', () => ({
  useActiveWorkout: { getState: () => ({ clear: () => calls.push('activeWorkout.clear') }) },
}));
vi.mock('@/ai/byok', () => ({
  resetAiSettings: async () => {
    calls.push('ai.reset');
  },
}));
vi.mock('@/store/settings-store', () => ({
  resetAccountPreferences: (opts: { keepDeviceSettings?: boolean }) =>
    calls.push(`prefs.reset:keepDevice=${String(opts.keepDeviceSettings)}`),
}));
vi.mock('@/sync/supabase-auth', () => ({
  clearAuthedSupabase: () => calls.push('supabase.clear'),
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

import { completeAccountSwitch, pendingLocalChanges, signOutLocalAccount } from '../account';
import { OWNER_KEY, resetUserData } from '../reset';

const faults: { failOn: RegExp | null } = { failOn: null };
let closeDb = () => {};

beforeEach(() => {
  faults.failOn = null;
  calls.length = 0;
  closeDb();
  const t = createTestDatabase(faults);
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

async function count(sql: string, ...params: unknown[]): Promise<number> {
  const row = await db().getFirstAsync<{ c: number }>(sql, ...params);
  return row?.c ?? 0;
}

/** Account-scoped kv the wipe must clear. */
const ACCOUNT_KV = [
  'coach.narrate.home.1',
  'ai.flags',
  'ai.cache.narrate.x',
  'active_program',
  'coaching.deload.snoozeUntil',
  'coaching.programPlan.lastAppliedAt',
  'coaching.readiness.today',
  'account_prefs_updated_at',
  'active-workout',
];
/** Device kv that must survive (settings blob is rewritten in memory, device id stays). */
const DEVICE_KV = ['device.id', 'settings'];

async function seedEverything() {
  const run = (sql: string, ...p: unknown[]) => db().runAsync(sql, ...p);
  await run(`INSERT INTO user_profile (id, name, goal, unit, onboarding_completed, updated_at)
             VALUES (1, 'Sam', 'build_muscle', 'metric', 1, 1)`);
  const log = await run(`INSERT INTO workout_logs (name, started_at, ended_at, unit, uuid, created_at, updated_at)
                         VALUES ('Push', 1, 2, 'metric', 'log-1', 1, 1)`);
  const ex = await run(`INSERT INTO exercises (name, primary_muscle, equipment, category, is_custom, created_at, updated_at)
                        VALUES ('Bench', 'chest', 'barbell', 'strength', 0, 1, 1)`);
  const exerciseId = ex.lastInsertRowId;
  await run(`INSERT INTO exercises (name, primary_muscle, equipment, category, is_custom, created_at, updated_at)
             VALUES ('My lift', 'chest', 'barbell', 'strength', 1, 1, 1)`);
  await run(`INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, uuid, created_at, updated_at)
             VALUES (?, ?, 0, 100, 5, 'set-1', 1, 1)`, log.lastInsertRowId, exerciseId);
  await run(`INSERT INTO session_exercise_notes (workout_log_id, exercise_id, notes, updated_at) VALUES (?, ?, 'n', 1)`,
    log.lastInsertRowId, exerciseId);
  await run(`INSERT INTO workout_photos (workout_log_id, uri, uuid, created_at, updated_at, byte_size)
             VALUES (?, 'file:///tmp/workout-photos/1/p.jpg', 'p-1', 1, 1, 100)`, log.lastInsertRowId);
  await run(`INSERT INTO photo_blob_queue (photo_uuid, op, attempts, next_attempt_at, created_at) VALUES ('p-1', 'upload', 0, 0, 1)`);
  await run(`INSERT INTO bodyweight_entries (weight, recorded_at, uuid, created_at) VALUES (80, 1, 'bw-1', 1)`);
  await run(`INSERT INTO body_measurements (metric, value, unit, recorded_at, uuid, created_at) VALUES ('waist', 80, 'cm', 1, 'bm-1', 1)`);
  await run(`INSERT INTO workout_templates (name, is_custom, uuid, created_at, updated_at) VALUES ('Mine', 1, 't-1', 1, 1)`);
  await run(`INSERT INTO programs (name, is_custom, uuid, created_at, updated_at) VALUES ('Block', 1, 'pr-1', 1, 1)`);
  await run(`INSERT INTO sync_outbox (table_name, row_uuid, op, payload, created_at, attempts)
             VALUES ('workout_logs', 'log-1', 'upsert', '{}', 1, 0)`);
  await run(`INSERT INTO schema_meta (key, value) VALUES ('sync_last_pull_at', '5')`);
  await run(`INSERT INTO schema_meta (key, value) VALUES (?, 'user-a')`, OWNER_KEY);
  for (const key of [...ACCOUNT_KV, ...DEVICE_KV]) {
    await run('INSERT INTO kv (key, value) VALUES (?, ?)', key, '1');
  }
}

async function snapshot() {
  return {
    profile: await count('SELECT COUNT(*) c FROM user_profile'),
    logs: await count('SELECT COUNT(*) c FROM workout_logs'),
    sets: await count('SELECT COUNT(*) c FROM set_entries'),
    notes: await count('SELECT COUNT(*) c FROM session_exercise_notes'),
    photos: await count('SELECT COUNT(*) c FROM workout_photos'),
    photoQueue: await count('SELECT COUNT(*) c FROM photo_blob_queue'),
    bodyweight: await count('SELECT COUNT(*) c FROM bodyweight_entries'),
    measurements: await count('SELECT COUNT(*) c FROM body_measurements'),
    customTemplates: await count('SELECT COUNT(*) c FROM workout_templates WHERE is_custom = 1'),
    customPrograms: await count('SELECT COUNT(*) c FROM programs WHERE is_custom = 1'),
    customExercises: await count('SELECT COUNT(*) c FROM exercises WHERE is_custom = 1'),
    outbox: await count('SELECT COUNT(*) c FROM sync_outbox'),
    syncMeta: await count("SELECT COUNT(*) c FROM schema_meta WHERE key = 'sync_last_pull_at'"),
    accountKv: await count(
      `SELECT COUNT(*) c FROM kv WHERE key IN (${ACCOUNT_KV.map(() => '?').join(',')})`,
      ...ACCOUNT_KV,
    ),
  };
}

const EMPTY = {
  profile: 0, logs: 0, sets: 0, notes: 0, photos: 0, photoQueue: 0, bodyweight: 0,
  measurements: 0, customTemplates: 0, customPrograms: 0, customExercises: 0, outbox: 0, syncMeta: 0, accountKv: 0,
};

async function owner(): Promise<string | null> {
  const row = await db().getFirstAsync<{ value: string }>('SELECT value FROM schema_meta WHERE key = ?', OWNER_KEY);
  return row?.value ?? null;
}

describe('resetUserData (the one reset path)', () => {
  it('clears every user table, account kv, outbox, cursors and photo files', async () => {
    await seedEverything();
    await resetUserData();
    expect(await snapshot()).toEqual(EMPTY);
    expect(calls).toContain('files:file:///tmp/workout-photos');
  });

  it('keeps the catalog, seed templates and device-only kv', async () => {
    await seedEverything();
    const catalog = await count('SELECT COUNT(*) c FROM exercises WHERE is_custom = 0');
    expect(catalog).toBeGreaterThan(0);
    await resetUserData();
    expect(await count('SELECT COUNT(*) c FROM exercises WHERE is_custom = 0')).toBe(catalog);
    expect(
      await count(`SELECT COUNT(*) c FROM kv WHERE key IN (${DEVICE_KV.map(() => '?').join(',')})`, ...DEVICE_KV),
    ).toBe(DEVICE_KV.length);
  });

  it('resets in-memory state after the commit, in order', async () => {
    await seedEverything();
    await resetUserData();
    expect(calls).toEqual([
      'queryClient.clear',
      'files:file:///tmp/workout-photos',
      'activeWorkout.clear',
      'ai.reset',
      'prefs.reset:keepDevice=true',
      'supabase.clear',
    ]);
  });

  it('keeps the owner unless told otherwise (recovery, dev tools, deletion)', async () => {
    await seedEverything();
    await resetUserData();
    expect(await owner()).toBe('user-a');
  });

  it('rolls back everything, touches no files or memory, when a statement fails', async () => {
    await seedEverything();
    const before = await snapshot();
    faults.failOn = /DELETE FROM sync_outbox/;
    await expect(resetUserData({ owner: null })).rejects.toThrow(/injected fault/);
    faults.failOn = null;
    expect(await snapshot()).toEqual(before);
    expect(await owner()).toBe('user-a');
    expect(calls).toEqual(['queryClient.clear']);
  });
});

describe('sign-out (#145)', () => {
  it('wipes everything, releases the claim and keeps device settings', async () => {
    await seedEverything();
    await signOutLocalAccount();
    expect(await snapshot()).toEqual(EMPTY);
    expect(await owner()).toBeNull();
    expect(calls).toContain('prefs.reset:keepDevice=true');
  });
});

describe('account switch', () => {
  it('runs the same wipe, claims the new owner and resets device settings too', async () => {
    await seedEverything();
    await completeAccountSwitch('user-b');
    expect(await snapshot()).toEqual(EMPTY);
    expect(await owner()).toBe('user-b');
    expect(calls).toContain('prefs.reset:keepDevice=false');
  });
});

describe('pendingLocalChanges', () => {
  it('counts outbox rows plus queued photo uploads/deletes', async () => {
    await seedEverything(); // 1 outbox + 1 upload
    await db().runAsync(
      `INSERT INTO photo_blob_queue (photo_uuid, op, attempts, next_attempt_at, created_at) VALUES ('p-2', 'download', 0, 0, 1)`,
    );
    expect(await pendingLocalChanges()).toBe(2);
  });
});
