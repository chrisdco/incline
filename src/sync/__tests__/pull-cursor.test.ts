/**
 * Per-table pull cursors (#140): fold to the page's last (updated_at, id),
 * park blocked rows for retry instead of pinning the cursor, page until a
 * short page, and migrate the legacy shared ms cursor exactly once.
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

import {
  EMPTY_CURSOR,
  foldPage,
  MAX_BLOCKED_RETRIES,
  settleRetries,
  type ApplyStatus,
  type TableCursor,
} from '../cursor';
import { cursorFilter, PULL_PAGE, pullTable, type PullSource, type RemoteRow } from '../pull';
import { getTableCursors, resetSyncState, setSyncStatus, setTableCursor } from '../state';

const SPEC = { table: 'set_entries' as const, cloud: 'set_entries', idCol: 'id' };

describe('foldPage', () => {
  it('advances to the last row of the page', () => {
    const next = foldPage(EMPTY_CURSOR, [
      { ts: 't1', id: 'a', status: 'ok' },
      { ts: 't2', id: 'b', status: 'ok' },
    ]);
    expect(next).toEqual({ ts: 't2', id: 'b', retry: {} });
  });

  it('moves past a blocked child and parks it for retry', () => {
    const next = foldPage(EMPTY_CURSOR, [
      { ts: 't1', id: 'a', status: 'ok' },
      { ts: 't2', id: 'blocked', status: 'blocked' },
      { ts: 't3', id: 'c', status: 'ok' },
    ]);
    expect(next.ts).toBe('t3');
    expect(next.retry).toEqual({ blocked: 1 });
  });

  it('clears a parked row that applies on a later page', () => {
    const start: TableCursor = { ts: 't1', id: 'a', retry: { x: 2 } };
    expect(foldPage(start, [{ ts: 't5', id: 'x', status: 'ok' }]).retry).toEqual({});
  });

  it('keeps the cursor on an empty page', () => {
    const start: TableCursor = { ts: 't1', id: 'a', retry: { x: 1 } };
    expect(foldPage(start, [])).toBe(start);
  });
});

describe('settleRetries', () => {
  it('drops resolved and vanished rows, bumps still-blocked ones', () => {
    const start: TableCursor = { ts: 't9', id: 'z', retry: { ok: 1, still: 1, gone: 3 } };
    const next = settleRetries(start, [
      { id: 'ok', status: 'ok' },
      { id: 'still', status: 'blocked' },
    ]);
    expect(next).toEqual({ ts: 't9', id: 'z', retry: { still: 2 } });
  });

  it('gives up after MAX_BLOCKED_RETRIES', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const start: TableCursor = { ts: 't', id: 'i', retry: { stuck: MAX_BLOCKED_RETRIES - 1 } };
    expect(settleRetries(start, [{ id: 'stuck', status: 'blocked' }]).retry).toEqual({});
    warn.mockRestore();
  });
});

describe('cursorFilter', () => {
  it('is a strict (updated_at, id) tuple comparison with quoted values', () => {
    expect(
      cursorFilter(SPEC, { ts: '2026-10-26T12:00:00.123456+00:00', id: 'abc', retry: {} }),
    ).toBe(
      'updated_at.gt."2026-10-26T12:00:00.123456+00:00",' +
        'and(updated_at.eq."2026-10-26T12:00:00.123456+00:00",id.gt."abc")',
    );
  });

  it('is inclusive for a cursor seeded from the legacy ms value', () => {
    expect(cursorFilter(SPEC, { ts: '2026-01-01T00:00:00.000Z', id: null, retry: {} })).toBe(
      'updated_at.gte."2026-01-01T00:00:00.000Z"',
    );
  });

  it('is absent before the first pull', () => {
    expect(cursorFilter(SPEC, EMPTY_CURSOR)).toBeNull();
  });
});

function row(i: number): RemoteRow {
  return { id: `id-${String(i).padStart(5, '0')}`, updated_at: `ts-${String(i).padStart(5, '0')}` };
}

/** In-memory server: rows sorted by (updated_at, id); cursor compare mirrors cursorFilter. */
function fakeSource(rows: RemoteRow[]) {
  const pages: number[] = [];
  const byIds: string[][] = [];
  const source: PullSource = {
    async fetchPage(_spec, cursor, limit) {
      const after = rows.filter((r) => {
        if (!cursor.ts) return true;
        const ts = String(r.updated_at);
        if (cursor.id == null) return ts >= cursor.ts;
        return ts > cursor.ts || (ts === cursor.ts && String(r.id) > cursor.id);
      });
      const page = after.slice(0, limit);
      pages.push(page.length);
      return page;
    },
    async fetchByIds(_spec, ids) {
      byIds.push(ids);
      return rows.filter((r) => ids.includes(String(r.id)));
    },
  };
  return { source, pages, byIds };
}

describe('pullTable', () => {
  it('pages until a short page and saves the cursor after every page', async () => {
    const all = Array.from({ length: PULL_PAGE * 2 + 7 }, (_, i) => row(i));
    const { source, pages } = fakeSource(all);
    const saved: TableCursor[] = [];
    const applied: number[] = [];

    const end = await pullTable(
      SPEC,
      EMPTY_CURSOR,
      source,
      async (_t, rows) => {
        applied.push(rows.length);
        return rows.map(() => 'ok' as ApplyStatus);
      },
      async (c) => {
        saved.push(c);
      },
    );

    expect(pages).toEqual([PULL_PAGE, PULL_PAGE, 7]);
    expect(applied).toEqual([PULL_PAGE, PULL_PAGE, 7]);
    expect(saved).toHaveLength(3);
    expect(end).toEqual({ ts: all.at(-1)!.updated_at, id: all.at(-1)!.id, retry: {} });
  });

  it('does not let a blocked row stall the rows behind it, and retries it next run', async () => {
    const all = [row(1), row(2), row(3)];
    const { source, byIds } = fakeSource(all);
    let parentArrived = false;
    const apply = async (_t: string, rows: RemoteRow[]) =>
      rows.map((r) => (r.id === 'id-00002' && !parentArrived ? 'blocked' : 'ok') as ApplyStatus);

    const first = await pullTable(SPEC, EMPTY_CURSOR, source, apply, async () => {});
    expect(first.id).toBe('id-00003');
    expect(first.retry).toEqual({ 'id-00002': 1 });

    parentArrived = true;
    const second = await pullTable(SPEC, first, source, apply, async () => {});
    expect(byIds).toEqual([['id-00002']]);
    expect(second).toEqual({ ts: 'ts-00003', id: 'id-00003', retry: {} });
  });
});

describe('table cursor storage', () => {
  let close: () => void;

  beforeEach(() => {
    const t = createTestDatabase();
    currentDb = t.db;
    close = t.close;
  });

  afterEach(() => {
    close();
    currentDb = null;
  });

  it('starts every table empty on a fresh install', async () => {
    const c = await getTableCursors(['workout_logs', 'set_entries']);
    expect(c).toEqual({ workout_logs: EMPTY_CURSOR, set_entries: EMPTY_CURSOR });
  });

  it('seeds from the legacy shared cursor once, then forgets it', async () => {
    await setSyncStatus({ cursor: Date.UTC(2026, 0, 1) });
    const first = await getTableCursors(['workout_logs']);
    expect(first.workout_logs).toEqual({ ts: '2026-01-01T00:00:00.000Z', id: null, retry: {} });

    // A table this build did not know about at migration time starts from zero.
    const later = await getTableCursors(['workout_logs', 'workout_photos']);
    expect(later.workout_logs.ts).toBe('2026-01-01T00:00:00.000Z');
    expect(later.workout_photos).toEqual(EMPTY_CURSOR);
  });

  it('persists per table and clears on reset', async () => {
    await setTableCursor('set_entries', { ts: 'x', id: 'y', retry: { r: 1 } });
    expect((await getTableCursors(['set_entries'])).set_entries).toEqual({
      ts: 'x',
      id: 'y',
      retry: { r: 1 },
    });
    await resetSyncState();
    expect((await getTableCursors(['set_entries'])).set_entries).toEqual(EMPTY_CURSOR);
  });
});
