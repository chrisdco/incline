/**
 * Health Connect weigh-ins → bodyweight entries on the real schema: one
 * transaction, dedupe by time against kept and deleted rows, junk dropped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDbHandle } from '@/db/__tests__/sqlite-adapter';

let currentDb: TestDbHandle | null = null;

vi.mock('@/db/client', () => ({
  openDatabase: async () => currentDb,
  openWriterDatabase: async () => currentDb,
  isDatabaseReady: () => currentDb != null,
  __resetDatabaseCacheForTests: () => {},
}));

vi.mock('expo-crypto', async () => ({ randomUUID: (await import('node:crypto')).randomUUID }));

import { importHealthWeights } from '@/db/queries/bodyweight';

const T = Date.parse('2026-11-10T07:00:00Z');
const MIN = 60_000;
let close: () => void;

describe('importHealthWeights', () => {
  beforeEach(() => {
    const h = createTestDatabase();
    currentDb = h.db;
    close = h.close;
  });
  afterEach(() => {
    close();
    currentDb = null;
  });

  it('adds new weigh-ins once, skipping ones already logged or deleted', async () => {
    await currentDb!.runAsync('INSERT INTO bodyweight_entries (weight, unit, recorded_at, created_at) VALUES (80, ?, ?, 0)', 'kg', T + 3 * MIN);
    await currentDb!.runAsync('INSERT INTO bodyweight_entries (weight, unit, recorded_at, deleted_at, created_at) VALUES (79, ?, ?, 1, 0)', 'kg', T + 86_400_000);
    const samples = [
      { at: T, value: 80.04 }, // same weigh-in as the manual entry
      { at: T + 86_400_000 + MIN, value: 79.2 }, // the user deleted this one
      { at: T + 2 * 86_400_000, value: 79.456 },
      { at: T + 2 * 86_400_000 + 2 * MIN, value: 79.5 }, // duplicate inside the batch
      { at: T + 3 * 86_400_000, value: 5 }, // junk
    ];
    expect(await importHealthWeights(samples)).toBe(1);
    expect(await importHealthWeights(samples)).toBe(0);
    const rows = await currentDb!.getAllAsync<{ weight: number; unit: string; uuid: string | null }>(
      'SELECT weight, unit, uuid FROM bodyweight_entries WHERE recorded_at = ?',
      T + 2 * 86_400_000,
    );
    expect(rows).toEqual([{ weight: 79.46, unit: 'kg', uuid: expect.any(String) }]);
    const queued = await currentDb!.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM sync_outbox WHERE table_name = 'bodyweight_entries'");
    expect(queued?.n).toBe(1);
  });
});
