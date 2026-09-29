/**
 * Routine duration honesty: create/duplicate/from-log must persist the real
 * duration instead of the old hardcoded 45 minutes.
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

import {
  createTemplate,
  createTemplateFromWorkoutLog,
  duplicateTemplate,
  getTemplate,
  sanitizeEstimatedMinutes,
} from '../queries/templates';

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

async function minutesOf(id: number): Promise<number> {
  const row = await db().getFirstAsync<{ estimated_minutes: number }>(
    'SELECT estimated_minutes FROM workout_templates WHERE id = ?',
    id,
  );
  return row?.estimated_minutes ?? -1;
}

describe('sanitizeEstimatedMinutes', () => {
  it('clamps to a sane window with 45 fallback', () => {
    expect(sanitizeEstimatedMinutes(60)).toBe(60);
    expect(sanitizeEstimatedMinutes(3)).toBe(5);
    expect(sanitizeEstimatedMinutes(999)).toBe(240);
    expect(sanitizeEstimatedMinutes(Number.NaN)).toBe(45);
    expect(sanitizeEstimatedMinutes(undefined)).toBe(45);
  });
});

describe('createTemplate', () => {
  it('persists the given duration instead of 45', async () => {
    const id = await createTemplate('Push', '', 'intermediate', 60);
    expect(await minutesOf(id)).toBe(60);
  });

  it('defaults to 45 when omitted', async () => {
    const id = await createTemplate('Push', '', 'intermediate');
    expect(await minutesOf(id)).toBe(45);
  });
});

describe('duplicateTemplate', () => {
  it('preserves the source duration', async () => {
    const src = await createTemplate('Push', '', 'intermediate', 75);
    const copy = await duplicateTemplate(src);
    expect(await minutesOf(copy)).toBe(75);
  });
});

describe('createTemplateFromWorkoutLog', () => {
  it('uses the finished session duration', async () => {
    await db().runAsync(
      `INSERT INTO exercises (id, name, primary_muscle, movement_pattern, equipment, category, created_at, updated_at)
       VALUES (1, 'Bench Press', 'chest', 'horizontal_push', 'barbell', 'strength', 1, 1)`,
    );
    await db().runAsync(
      `INSERT INTO workout_logs (id, name, started_at, ended_at, duration_seconds, total_volume, unit, created_at, updated_at)
       VALUES (1, 'Push', 100, 3700, 3600, 1000, 'metric', 1, 1)`,
    );
    await db().runAsync(
      `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, created_at, updated_at)
       VALUES (1, 1, 0, 80, 8, 1, 1, 1)`,
    );
    const id = await createTemplateFromWorkoutLog(1);
    expect(await minutesOf(id)).toBe(60);
    // Exercises still carried over.
    expect((await getTemplate(id))?.exercises?.length).toBe(1);
  });
});
