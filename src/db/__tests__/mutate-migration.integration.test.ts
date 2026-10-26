/**
 * Atomicity of the profile / program / photo writes moved onto mutate()
 * (#141, #138). Real query modules over the real schema; fault injection
 * (faults.failOn) throws mid-transaction and every row change — including
 * the outbox rows — must roll back with it.
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

const deleted: string[] = [];

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///tmp/',
  makeDirectoryAsync: async () => {},
  copyAsync: async () => {},
  deleteAsync: async (uri: string) => {
    deleted.push(uri);
  },
  getInfoAsync: async () => ({ exists: false }),
}));

vi.mock('@/sync/photo-blobs', () => ({
  checksumFile: async () => ({ byteSize: 10, checksum: 'checksum' }),
  compressPhotoToJpeg: async () => 'file:///tmp/compressed.jpg',
  enqueuePhotoBlob: async () => {},
  localPhotoPath: (logId: number, uuid: string) => `file:///tmp/workout-photos/${logId}/${uuid}.jpg`,
}));

const clearQueries = vi.fn();
vi.mock('@/lib/query-client', () => ({
  queryClient: { clear: () => clearQueries() },
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

import { addWorkoutPhotos } from '../queries/photos';
import { completeOnboarding, resetUserData } from '../queries/profile';
import {
  ACTIVE_PROGRAM_KEY,
  createProgram,
  setActiveProgram,
  setProgramDay,
} from '../queries/programs';

const faults: { failOn: RegExp | null } = { failOn: null };
let closeDb = () => {};

beforeEach(() => {
  faults.failOn = null;
  deleted.length = 0;
  clearQueries.mockClear();
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

async function seedCustomTemplate(): Promise<number> {
  const res = await db().runAsync(
    `INSERT INTO workout_templates (name, description, category, difficulty, estimated_minutes, is_custom, uuid, created_at, updated_at)
     VALUES ('Push', '', 'strength', 'intermediate', 45, 1, 'tpl-uuid', 1, 1)`,
  );
  return res.lastInsertRowId;
}

const OUTBOX_INSERT = /INSERT INTO sync_outbox/;

describe('program writes', () => {
  it('rolls back a program-day edit when its enqueue fails', async () => {
    const templateId = await seedCustomTemplate();
    const programId = await createProgram('Block', '', 4);
    const before = await db().getFirstAsync<{ updated_at: number }>('SELECT updated_at FROM programs WHERE id = ?', programId);
    const outboxBefore = await count('SELECT COUNT(*) c FROM sync_outbox');

    faults.failOn = OUTBOX_INSERT;
    await expect(setProgramDay(programId, 1, 1, templateId)).rejects.toThrow(/injected fault/);
    faults.failOn = null;

    expect(await count('SELECT COUNT(*) c FROM program_workouts WHERE program_id = ?', programId)).toBe(0);
    expect(await count('SELECT COUNT(*) c FROM sync_outbox')).toBe(outboxBefore);
    const after = await db().getFirstAsync<{ updated_at: number }>('SELECT updated_at FROM programs WHERE id = ?', programId);
    expect(after?.updated_at).toBe(before?.updated_at);

    // Same edit succeeds once the fault clears: slot + slot/program outbox rows.
    await setProgramDay(programId, 1, 1, templateId);
    expect(await count('SELECT COUNT(*) c FROM program_workouts WHERE program_id = ?', programId)).toBe(1);
    expect(await count("SELECT COUNT(*) c FROM sync_outbox WHERE table_name = 'user_program_workouts'")).toBe(1);
  });

  it('keeps the active-program kv row and its outbox entry together', async () => {
    const programId = await createProgram('Block', '', 4);
    faults.failOn = OUTBOX_INSERT;
    await expect(setActiveProgram(programId)).rejects.toThrow(/injected fault/);
    faults.failOn = null;
    expect(await count('SELECT COUNT(*) c FROM kv WHERE key = ?', ACTIVE_PROGRAM_KEY)).toBe(0);
  });
});

describe('completeOnboarding', () => {
  it('is atomic: no profile row or outbox row survives a failed enqueue', async () => {
    faults.failOn = OUTBOX_INSERT;
    await expect(
      completeOnboarding({ name: 'Sam', goal: 'build_muscle', unit: 'metric' }),
    ).rejects.toThrow(/injected fault/);
    faults.failOn = null;

    // ensureProfileRow's insert ran in the same transaction, so it is gone too.
    expect(await count('SELECT COUNT(*) c FROM user_profile')).toBe(0);
    expect(await count('SELECT COUNT(*) c FROM sync_outbox')).toBe(0);

    await completeOnboarding({ name: 'Sam', goal: 'build_muscle', unit: 'metric' });
    const row = await db().getFirstAsync<{ name: string; onboarding_completed: number }>(
      'SELECT name, onboarding_completed FROM user_profile WHERE id = 1',
    );
    expect(row).toEqual({ name: 'Sam', onboarding_completed: 1 });
    expect(await count("SELECT COUNT(*) c FROM sync_outbox WHERE table_name = 'profiles'")).toBe(1);
  });
});

describe('resetUserData', () => {
  async function seedUserData() {
    await completeOnboarding({ name: 'Sam', goal: 'build_muscle', unit: 'metric' });
    const templateId = await seedCustomTemplate();
    const programId = await createProgram('Block', '', 4);
    await setProgramDay(programId, 1, 1, templateId);
    await setActiveProgram(programId);
    await db().runAsync(
      `INSERT INTO workout_logs (name, started_at, ended_at, unit, uuid, created_at, updated_at)
       VALUES ('Push', 1, 2, 'metric', 'log-uuid', 1, 1)`,
    );
    await db().runAsync(
      "INSERT INTO schema_meta (key, value) VALUES ('sync_last_pull_at', '5')",
    );
  }

  async function userRowCounts() {
    return {
      profile: await count('SELECT COUNT(*) c FROM user_profile'),
      logs: await count('SELECT COUNT(*) c FROM workout_logs'),
      templates: await count('SELECT COUNT(*) c FROM workout_templates WHERE is_custom = 1'),
      programs: await count('SELECT COUNT(*) c FROM programs WHERE is_custom = 1'),
      slots: await count('SELECT COUNT(*) c FROM program_workouts'),
      active: await count('SELECT COUNT(*) c FROM kv WHERE key = ?', ACTIVE_PROGRAM_KEY),
      outbox: await count('SELECT COUNT(*) c FROM sync_outbox'),
      syncMeta: await count("SELECT COUNT(*) c FROM schema_meta WHERE key = 'sync_last_pull_at'"),
    };
  }

  it('wipes every user table and clears the query cache', async () => {
    await seedUserData();
    await resetUserData();
    expect(clearQueries).toHaveBeenCalledTimes(1);
    expect(await userRowCounts()).toEqual({
      profile: 0, logs: 0, templates: 0, programs: 0, slots: 0, active: 0, outbox: 0, syncMeta: 0,
    });
    expect(deleted).toContain('file:///tmp/workout-photos');
  });

  it('leaves no partial state when a late delete fails', async () => {
    await seedUserData();
    const before = await userRowCounts();
    expect(before.outbox).toBeGreaterThan(0);

    // The outbox wipe runs last — everything before it must roll back.
    faults.failOn = /DELETE FROM sync_outbox/;
    await expect(resetUserData()).rejects.toThrow(/injected fault/);
    faults.failOn = null;

    expect(await userRowCounts()).toEqual(before);
    // Photo files are removed only after the wipe commits.
    expect(deleted).toEqual([]);
  });
});

describe('addWorkoutPhotos', () => {
  it('deletes the copied file when the DB write fails', async () => {
    const log = await db().runAsync(
      `INSERT INTO workout_logs (name, started_at, ended_at, unit, uuid, created_at, updated_at)
       VALUES ('Push', 1, 2, 'metric', 'log-uuid', 1, 1)`,
    );
    const logId = log.lastInsertRowId;
    faults.failOn = OUTBOX_INSERT;
    await expect(addWorkoutPhotos(logId, ['file:///src.jpg'])).rejects.toThrow(/injected fault/);
    faults.failOn = null;

    expect(await count('SELECT COUNT(*) c FROM workout_photos')).toBe(0);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toMatch(/workout-photos\/\d+\/.+\.jpg$/);
  });
});
