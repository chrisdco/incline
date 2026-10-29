/**
 * Fire-and-forget outbox writes (#138): retried, then reported to the error
 * sink and sync_status.lastError — never swallowed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDbHandle } from '@/db/__tests__/sqlite-adapter';
import { setErrorSink } from '@/lib/error-sink';

let currentDb: TestDbHandle | null = null;

vi.mock('@/db/client', () => ({
  openDatabase: async () => {
    if (!currentDb) throw new Error('test db not mounted');
    return currentDb;
  },
}));

import { BACKGROUND_WRITE_ERROR, runBackgroundWrite } from '../background';
import { getSyncStatus } from '../state';

describe('runBackgroundWrite', () => {
  let close: () => void;
  let reported: { error: unknown; ctx?: Record<string, unknown> }[];

  beforeEach(() => {
    const t = createTestDatabase();
    currentDb = t.db;
    close = t.close;
    reported = [];
    setErrorSink((error, ctx) => reported.push({ error, ctx }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    close();
    currentDb = null;
    setErrorSink(null);
    vi.restoreAllMocks();
  });

  it('retries a transient failure and reports nothing when it recovers', async () => {
    let calls = 0;
    const ok = await runBackgroundWrite(
      'test.write',
      async () => {
        if (++calls < 2) throw new Error('database is locked');
      },
      { delayMs: 0 },
    );
    expect(ok).toBe(true);
    expect(calls).toBe(2);
    expect(reported).toHaveLength(0);
    expect((await getSyncStatus()).lastError).toBeNull();
  });

  it('reports a persistent failure and surfaces it in sync status', async () => {
    const boom = new Error('disk I/O error');
    let calls = 0;
    const ok = await runBackgroundWrite(
      'test.write',
      async () => {
        calls++;
        throw boom;
      },
      { attempts: 3, delayMs: 0 },
    );
    expect(ok).toBe(false);
    expect(calls).toBe(3);
    expect(reported).toEqual([{ error: boom, ctx: { where: 'test.write', attempts: 3 } }]);
    expect(await getSyncStatus()).toMatchObject({ status: 'error', lastError: BACKGROUND_WRITE_ERROR });
  });
});
