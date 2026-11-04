/**
 * Catalog seed from Supabase: diff-based, batched through mutate().
 *
 * The seed used to write every row on the read connection on every launch,
 * outside mutate()'s queue, so starting a workout during it failed with
 * "database is locked". These pin the fixed shape: one read for the diff,
 * writes only for what changed, all writes inside mutate().
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDbHandle } from './sqlite-adapter';
import type { SupabaseExercise } from '@/lib/supabase';

let currentDb: TestDbHandle | null = null;
let remote: SupabaseExercise[] = [];
let inMutate = 0;
let writesOutsideMutate = 0;

vi.mock('../client', () => ({
  openDatabase: async () => currentDb,
  openWriterDatabase: async () => currentDb,
  isDatabaseReady: () => currentDb != null,
  __resetDatabaseCacheForTests: () => {},
}));

vi.mock('@/lib/supabase', () => ({
  supabaseReady: true,
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (from: number, to: number) => ({ data: remote.slice(from, to + 1), error: null }),
        }),
      }),
    }),
  },
}));

vi.mock('../write', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../write')>();
  return {
    ...actual,
    mutate: async (...args: Parameters<typeof actual.mutate>) => {
      inMutate++;
      try {
        return await actual.mutate(...args);
      } finally {
        inMutate--;
      }
    },
  };
});

import { seedFromSupabase } from '../seed-supabase';

function exercise(id: string, overrides: Partial<SupabaseExercise> = {}): SupabaseExercise {
  return {
    id: 0,
    external_id: id,
    name: `Exercise ${id}`,
    target_muscle: 'pectorals',
    equipment: 'barbell',
    category: 'strength',
    is_compound: true,
    difficulty: 'intermediate',
    movement_pattern: 'horizontal_push',
    secondary_muscles: ['triceps'],
    instructions: ['Lie down', 'Press'],
    gif_url: `https://example.com/${id}.gif`,
    ...overrides,
  } as SupabaseExercise;
}

let close: (() => void) | null = null;

beforeEach(() => {
  const t = createTestDatabase({
    beforeStatement: (sql) => {
      if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql) && inMutate === 0) writesOutsideMutate++;
    },
  });
  currentDb = t.db;
  close = t.close;
  remote = [];
  writesOutsideMutate = 0;
});

afterEach(() => {
  close?.();
  currentDb = null;
});

async function count(table: string): Promise<number> {
  const row = await currentDb!.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return row?.n ?? 0;
}

describe('seedFromSupabase', () => {
  it('inserts new exercises with their children, all inside mutate()', async () => {
    remote = Array.from({ length: 250 }, (_, i) => exercise(`ex-${i}`));
    const inserted = await seedFromSupabase(currentDb as never);

    expect(inserted).toBe(250);
    expect(await count("exercises WHERE source = 'exercisedb'")).toBe(250);
    expect(await count('exercise_instructions')).toBe(500);
    expect(await count('exercise_secondary_muscles')).toBe(250);
    expect(await count('exercise_images')).toBe(250);
    expect(writesOutsideMutate).toBe(0);
  });

  it('writes nothing on a repeat run with unchanged upstream data', async () => {
    remote = [exercise('a'), exercise('b')];
    await seedFromSupabase(currentDb as never);

    const spy = vi.spyOn(currentDb!, 'runAsync');
    expect(await seedFromSupabase(currentDb as never)).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('updates changed rows and removes exercises gone upstream', async () => {
    remote = [exercise('a'), exercise('b')];
    await seedFromSupabase(currentDb as never);

    remote = [exercise('a', { name: 'Renamed A' })];
    await seedFromSupabase(currentDb as never);

    const names = await currentDb!.getAllAsync<{ name: string }>(
      "SELECT name FROM exercises WHERE source = 'exercisedb' ORDER BY name",
    );
    expect(names.map((r) => r.name)).toEqual(['Renamed A']);
    expect(await count('exercise_images')).toBe(1);
    expect(writesOutsideMutate).toBe(0);
  });
});
