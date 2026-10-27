/**
 * One-shot canonical-units backfill (TECH-DECISIONS §15): imperial users'
 * pound numbers become kg, labelled body rows become kg/cm, every converted
 * row is re-enqueued, and the backfill never runs twice.
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
  openWriterDatabase: async () => {
    if (!currentDb) throw new Error('test db not mounted');
    return currentDb;
  },
  isDatabaseReady: () => currentDb != null,
  __resetDatabaseCacheForTests: () => {},
}));

import { canonicalizeStoredUnits } from '../canonical-units';
import { LB_PER_KG } from '@/lib/units';

let closeDb = () => {};

beforeEach(() => {
  const t = createTestDatabase({ failOn: null });
  currentDb = t.db;
  closeDb = t.close;
});

afterEach(() => {
  closeDb();
  currentDb = null;
});

const db = () => currentDb!;

async function setGlobalUnit(unit: 'metric' | 'imperial') {
  await db().runAsync(
    'INSERT INTO kv (key, value) VALUES (?, ?)',
    'settings',
    JSON.stringify({ state: { unit }, version: 0 }),
  );
}

async function seedLoggedSet() {
  await db().runAsync(
    `INSERT INTO workout_logs (id, name, started_at, ended_at, duration_seconds, total_volume, unit, uuid, created_at, updated_at)
     VALUES (1, 'Push', 100, 200, 60, 1350, 'metric', 'log-1', 1, 1)`,
  );
  await db().runAsync(
    `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, set_type, uuid, created_at, updated_at)
     VALUES (1, 1, 0, 135, 10, 1, 'working', 'set-1', 1, 1)`,
  );
}

async function outboxTables(): Promise<string[]> {
  const rows = await db().getAllAsync<{ table_name: string }>('SELECT table_name FROM sync_outbox ORDER BY id');
  return rows.map((r) => r.table_name);
}

describe('canonicalizeStoredUnits', () => {
  it('imperial: divides set weights and log volume into kg and re-enqueues them', async () => {
    await setGlobalUnit('imperial');
    await seedLoggedSet();

    const res = await canonicalizeStoredUnits(db());

    expect(res).toMatchObject({ ran: true, sets: 1, logs: 1 });
    const set = await db().getFirstAsync<{ weight: number }>('SELECT weight FROM set_entries');
    expect(set!.weight).toBeCloseTo(135 / LB_PER_KG, 9);
    const log = await db().getFirstAsync<{ total_volume: number }>('SELECT total_volume FROM workout_logs');
    expect(log!.total_volume).toBeCloseTo(1350 / LB_PER_KG, 9);
    expect(await outboxTables()).toEqual(expect.arrayContaining(['set_entries', 'workout_logs']));
  });

  it('metric: leaves set weights untouched and enqueues nothing for them', async () => {
    await setGlobalUnit('metric');
    await seedLoggedSet();

    const res = await canonicalizeStoredUnits(db());

    expect(res).toMatchObject({ ran: true, sets: 0, logs: 0 });
    const set = await db().getFirstAsync<{ weight: number }>('SELECT weight FROM set_entries');
    expect(set!.weight).toBe(135);
    expect(await outboxTables()).toEqual([]);
  });

  it('converts labelled body rows regardless of the global unit (#144)', async () => {
    await setGlobalUnit('metric');
    await db().runAsync(
      `INSERT INTO bodyweight_entries (weight, unit, recorded_at, uuid, created_at, updated_at) VALUES (176.37, 'lb', 1, 'bw-1', 1, 1)`,
    );
    await db().runAsync(
      `INSERT INTO body_measurements (metric, value, unit, recorded_at, uuid, created_at, updated_at) VALUES ('waist', 32, 'in', 1, 'm-1', 1, 1)`,
    );

    const res = await canonicalizeStoredUnits(db());

    expect(res).toMatchObject({ bodyweight: 1, measurements: 1 });
    const bw = await db().getFirstAsync<{ weight: number; unit: string }>('SELECT weight, unit FROM bodyweight_entries');
    expect(bw!.unit).toBe('kg');
    expect(bw!.weight).toBeCloseTo(80, 2);
    const m = await db().getFirstAsync<{ value: number; unit: string }>('SELECT value, unit FROM body_measurements');
    expect(m).toEqual({ value: expect.closeTo(81.28, 6), unit: 'cm' });
  });

  it('runs once per device', async () => {
    await setGlobalUnit('imperial');
    await seedLoggedSet();
    await canonicalizeStoredUnits(db());
    const again = await canonicalizeStoredUnits(db());

    expect(again.ran).toBe(false);
    const set = await db().getFirstAsync<{ weight: number }>('SELECT weight FROM set_entries');
    expect(set!.weight).toBeCloseTo(135 / LB_PER_KG, 9);
  });

  it('fresh install with no settings yet: marks done, converts nothing', async () => {
    const res = await canonicalizeStoredUnits(db());
    expect(res).toMatchObject({ ran: true, sets: 0, bodyweight: 0 });
    const flag = await db().getFirstAsync<{ value: string }>("SELECT value FROM schema_meta WHERE key = 'units_canonical'");
    expect(flag).not.toBeNull();
  });
});
