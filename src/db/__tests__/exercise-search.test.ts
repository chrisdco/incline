/**
 * Integration tests for tokenized exercise search: the REAL queries module
 * against the REAL schema (search_text included) via the better-sqlite3
 * adapter. Covers what unit tests cannot: SQL prefilter recall, alias joins,
 * and the recency boost end to end.
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

import { searchExercises } from '../queries/exercises';

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
  muscle = 'chest',
  aliases: string[] = [],
  opts?: { equipment?: string; pattern?: string },
) {
  await db().runAsync(
    `INSERT INTO exercises (id, name, primary_muscle, movement_pattern, equipment, category, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'strength', 1, 1)`,
    id,
    name,
    muscle,
    opts?.pattern ?? 'horizontal_push',
    opts?.equipment ?? 'barbell',
  );
  // Mirror migration 019 backfill for the seeded row.
  await db().runAsync(
    `UPDATE exercises SET search_text = trim(lower(
      replace(replace(replace(coalesce(name, ''), '(', ' '), ')', ' '), ',', ' ')
      || ' ' || coalesce(primary_muscle, '')
      || ' ' || coalesce(equipment, '')
      || ' ' || coalesce(movement_pattern, '')
      || ' ' || coalesce(category, '')
    )) WHERE id = ?`,
    id,
  );
  for (const alias of aliases) {
    await db().runAsync('INSERT INTO exercise_aliases (exercise_id, alias) VALUES (?, ?)', id, alias);
  }
}

async function names(query: string, recentIds: number[] = []): Promise<string[]> {
  const hits = await searchExercises(query, undefined, { recentIds });
  return hits.map((h) => h.exercise.name);
}

describe('searchExercises', () => {
  it('matches regardless of word order', async () => {
    await seedExercise(1, 'Bench Press (Barbell)');
    await seedExercise(2, 'Back Squat');
    expect(await names('press bench')).toEqual(['Bench Press (Barbell)']);
  });

  it('tolerates gym typos', async () => {
    await seedExercise(1, 'Bench Press (Barbell)');
    await seedExercise(2, 'Back Squat');
    expect(await names('bnech')).toEqual(['Bench Press (Barbell)']);
  });

  it('folds plurals and matches aliases', async () => {
    await seedExercise(1, 'Bicep Curl', 'biceps', ['curl', 'dumbbell curl']);
    await seedExercise(2, 'Back Squat');
    expect(await names('curls')).toContain('Bicep Curl');
    expect(await names('dumbbell curl')).toContain('Bicep Curl');
  });

  it('boosts recently used exercises (Hevy move)', async () => {
    await seedExercise(1, 'Bench Press (Barbell)');
    await seedExercise(2, 'Overhead Press (Barbell)');
    // Same band, alphabetical would put Bench first.
    expect(await names('press')).toEqual(['Bench Press (Barbell)', 'Overhead Press (Barbell)']);
    expect(await names('press', [2])).toEqual(['Overhead Press (Barbell)', 'Bench Press (Barbell)']);
  });

  it('falls back to muscle matches', async () => {
    await seedExercise(1, 'Bench Press (Barbell)', 'chest');
    await seedExercise(2, 'Back Squat', 'quads');
    expect(await names('chest')).toEqual(['Bench Press (Barbell)']);
  });

  it('returns everything scored zero on empty query', async () => {
    await seedExercise(1, 'Bench Press (Barbell)');
    await seedExercise(2, 'Back Squat');
    const hits = await searchExercises('');
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.score === 0)).toBe(true);
  });

  it('filters by equipment without text', async () => {
    await seedExercise(1, 'Bench Press (Barbell)', 'chest', [], { equipment: 'barbell' });
    await seedExercise(2, 'Push-Up', 'chest', [], { equipment: 'bodyweight' });
    const hits = await searchExercises('', { equipment: 'bodyweight' });
    expect(hits.map((h) => h.exercise.name)).toEqual(['Push-Up']);
  });

  it('combines text, equipment, and pattern filters', async () => {
    await seedExercise(1, 'Bench Press (Barbell)', 'chest', [], { equipment: 'barbell', pattern: 'horizontal_push' });
    await seedExercise(2, 'Overhead Press (Barbell)', 'shoulders', [], { equipment: 'barbell', pattern: 'vertical_push' });
    const hits = await searchExercises('press', { equipment: 'barbell', pattern: 'vertical_push' });
    expect(hits.map((h) => h.exercise.name)).toEqual(['Overhead Press (Barbell)']);
  });
});
