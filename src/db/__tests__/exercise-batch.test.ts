/**
 * Batch exercise mapping: listExercises / listCustomExercises /
 * getRecentExercises must return fully mapped rows (aliases, secondary
 * muscles, instructions, primary image) in a constant handful of queries —
 * never the old 4N per-row mapping. Uses the REAL queries module against
 * the REAL schema via the better-sqlite3 adapter.
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

import { getRecentExercises, listCustomExercises, listExercises } from '../queries/exercises';

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

async function seedExercise(
  id: number,
  name: string,
  opts?: { muscle?: string; custom?: boolean; alias?: string; secondary?: string; instruction?: string; image?: string },
) {
  await db().runAsync(
    `INSERT INTO exercises (id, name, primary_muscle, movement_pattern, equipment, category, is_custom, source, created_at, updated_at)
     VALUES (?, ?, ?, 'horizontal_push', 'barbell', 'strength', ?, 'seed', 1, 1)`,
    id,
    name,
    opts?.muscle ?? 'chest',
    opts?.custom ? 1 : 0,
  );
  if (opts?.alias) {
    await db().runAsync('INSERT INTO exercise_aliases (exercise_id, alias) VALUES (?, ?)', id, opts.alias);
  }
  if (opts?.secondary) {
    await db().runAsync(
      'INSERT INTO exercise_secondary_muscles (exercise_id, muscle) VALUES (?, ?)',
      id,
      opts.secondary,
    );
  }
  if (opts?.instruction) {
    await db().runAsync(
      'INSERT INTO exercise_instructions (exercise_id, step, text) VALUES (?, 1, ?)',
      id,
      opts.instruction,
    );
  }
  if (opts?.image) {
    await db().runAsync(
      'INSERT INTO exercise_images (exercise_id, url, is_primary, sort_order) VALUES (?, ?, 1, 0)',
      id,
      opts.image,
    );
  }
}

describe('listExercises batch mapping', () => {
  it('returns fully mapped rows without per-row queries', async () => {
    await seedExercise(1, 'Bench Press', {
      alias: 'bench',
      secondary: 'triceps',
      instruction: 'Press up',
      image: 'https://img/bench.gif',
    });
    await seedExercise(2, 'Back Squat');
    const all = await listExercises();
    expect(all.map((e) => e.name)).toEqual(['Back Squat', 'Bench Press']);
    const bench = all.find((e) => e.name === 'Bench Press')!;
    expect(bench.aliases).toEqual(['bench']);
    expect(bench.secondaryMuscles).toEqual(['triceps']);
    expect(bench.instructions).toEqual(['Press up']);
    expect(bench.imageUrl).toBe('https://img/bench.gif');
    const squat = all.find((e) => e.name === 'Back Squat')!;
    expect(squat.aliases).toEqual([]);
    expect(squat.imageUrl).toBe(null);
  });

  it('lists only customs with mapping intact', async () => {
    await seedExercise(1, 'Bench Press');
    await seedExercise(2, 'My Lift', { custom: true, alias: 'mine' });
    const customs = await listCustomExercises();
    expect(customs.map((e) => e.name)).toEqual(['My Lift']);
    expect(customs[0].aliases).toEqual(['mine']);
    expect(customs[0].isCustom).toBe(true);
  });

  it('recents map fully from the join', async () => {
    await seedExercise(1, 'Bench Press', { alias: 'bench' });
    await db().runAsync(
      `INSERT INTO workout_logs (id, name, started_at, ended_at, duration_seconds, total_volume, unit, created_at, updated_at)
       VALUES (1, 'Push', 100, 200, 60, 0, 'metric', 1, 1)`,
    );
    await db().runAsync(
      `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, created_at, updated_at)
       VALUES (1, 1, 0, 80, 8, 1, 1, 1)`,
    );
    const recents = await getRecentExercises(8);
    expect(recents.map((e) => e.name)).toEqual(['Bench Press']);
    expect(recents[0].aliases).toEqual(['bench']);
  });
});
