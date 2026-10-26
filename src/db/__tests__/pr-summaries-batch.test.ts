/**
 * Batched PR summaries (session open) must match the per-exercise rules:
 * working sets of finished logs only, zeros for exercises with no history.
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

import { getExercisePRSummaries, getExercisePRSummary } from '../queries/exercises';

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

async function log(id: number, endedAt: number | null) {
  await currentDb!.runAsync(
    `INSERT INTO workout_logs (id, name, started_at, ended_at, duration_seconds, total_volume, unit, created_at, updated_at)
     VALUES (?, 'W', ?, ?, 60, 0, 'metric', 1, 1)`,
    id,
    id * 100,
    endedAt,
  );
}

async function set(logId: number, exerciseId: number, weight: number, reps: number, setType = 'working', createdAt = 1) {
  await currentDb!.runAsync(
    `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, set_type, created_at, updated_at)
     VALUES (?, ?, 0, ?, ?, 1, ?, ?, 1)`,
    logId,
    exerciseId,
    weight,
    reps,
    setType,
    createdAt,
  );
}

describe('getExercisePRSummaries', () => {
  it('matches per-exercise rules for several exercises at once', async () => {
    await log(1, 150);
    await log(2, 250);
    await log(3, null); // open session: ignored
    await set(1, 10, 100, 5, 'working', 10);
    await set(1, 10, 80, 10, 'working', 11);
    await set(2, 10, 100, 3, 'working', 20); // ties heaviest, later
    await set(2, 10, 140, 1, 'warmup', 21); // warm-up never wins
    await set(3, 10, 200, 5, 'working', 30); // unfinished log never wins
    await set(1, 20, 50, 12, 'working', 12);

    const all = await getExercisePRSummaries([10, 20, 30]);

    expect(all[10].heaviestWeight).toBe(100);
    expect(all[10].heaviestWeightAt).toBe(20);
    expect(all[10].bestSetVolume).toBe(800);
    expect(all[10].bestSessionVolume).toBe(1300);
    expect(all[10].best1RM).toBeCloseTo(116.67, 2);
    expect(all[20].heaviestWeight).toBe(50);
    expect(all[30]).toEqual({
      heaviestWeight: 0,
      best1RM: 0,
      bestSetVolume: 0,
      bestSessionVolume: 0,
      heaviestWeightAt: 0,
    });
    expect(await getExercisePRSummary(10)).toEqual(all[10]);
  });

  it('returns an empty map for no ids', async () => {
    expect(await getExercisePRSummaries([])).toEqual({});
  });
});
