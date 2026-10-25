/**
 * Outbox ack must not drop an edit that coalesced into the row while its
 * push was in flight (same id, newer payload).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDbHandle } from '@/db/__tests__/sqlite-adapter';

let currentDb: TestDbHandle | null = null;

vi.mock('@/db/client', () => ({
  openDatabase: async () => {
    if (!currentDb) throw new Error('test db not mounted');
    return currentDb;
  },
}));

import { enqueueSync, listOutbox, removeOutbox } from '../outbox';

describe('removeOutbox', () => {
  let close: () => void;

  beforeEach(() => {
    const t = createTestDatabase();
    currentDb = t.db;
    close = t.close;
  });

  afterEach(() => {
    close();
    currentDb = null;
    vi.useRealTimers();
  });

  it('acks the pushed row when nothing changed', async () => {
    await enqueueSync('set_entries', 'set-1', 'upsert', { weight: 100 });
    const [pushed] = await listOutbox();
    await removeOutbox(pushed);
    expect(await listOutbox()).toHaveLength(0);
  });

  it('keeps an edit that coalesced in while the push was in flight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    await enqueueSync('set_entries', 'set-1', 'upsert', { weight: 100 });
    const [pushed] = await listOutbox();

    // User edits the same set mid-push: same outbox id, newer payload.
    vi.setSystemTime(2_000);
    await enqueueSync('set_entries', 'set-1', 'upsert', { weight: 105 });

    await removeOutbox(pushed);
    const left = await listOutbox();
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(pushed.id);
    expect(JSON.parse(left[0].payload ?? '{}')).toEqual({ weight: 105 });
  });

  it('keeps a same-millisecond edit with a different payload', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
    await enqueueSync('set_entries', 'set-1', 'upsert', { reps: 8 });
    const [pushed] = await listOutbox();
    await enqueueSync('set_entries', 'set-1', 'upsert', { reps: 10 });

    await removeOutbox(pushed);
    expect(await listOutbox()).toHaveLength(1);
  });
});
