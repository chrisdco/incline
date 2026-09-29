/**
 * Volume honesty: stored total_volume keeps every completed set (full
 * information), while displays derive working-only volume via
 * getWorkingVolume(s). Warm-ups must never inflate the derived number.
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
  isDatabaseReady: () => currentDb != null,
  __resetDatabaseCacheForTests: () => {},
}));

import { getWorkingVolume, getWorkingVolumes } from '../queries/helpers';

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

async function seedLogWithSets() {
  await db().runAsync(
    `INSERT INTO workout_logs (id, name, started_at, ended_at, duration_seconds, total_volume, unit, created_at, updated_at)
     VALUES (1, 'Push', 100, 200, 60, 2040, 'metric', 1, 1)`,
  );
  const sets: [number, number, number, string][] = [
    // set_index, weight, reps, set_type
    [0, 40, 8, 'warmup'],
    [1, 80, 8, 'working'],
    [2, 80, 6, 'working'],
    [3, 60, 10, 'drop'],
  ];
  for (const [i, w, r, t] of sets) {
    await db().runAsync(
      `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, set_type, created_at, updated_at)
       VALUES (1, 1, ?, ?, ?, 1, ?, 1, 1)`,
      i,
      w,
      r,
      t,
    );
  }
}

describe('getWorkingVolume', () => {
  it('excludes warm-ups and drop sets', async () => {
    await seedLogWithSets();
    // Stored total keeps everything: 40*8 + 80*8 + 80*6 + 60*10 = 2040.
    // Working: 80*8 + 80*6 = 1120.
    expect(await getWorkingVolume(1)).toBe(1120);
  });

  it('maps per-log volumes and zeroes missing logs', async () => {
    await seedLogWithSets();
    const map = await getWorkingVolumes([1, 999]);
    expect(map.get(1)).toBe(1120);
    expect(map.get(999)).toBe(0);
  });

  it('returns empty map for empty input without querying', async () => {
    await expect(getWorkingVolumes([])).resolves.toEqual(new Map());
  });
});
