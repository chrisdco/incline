import { openDatabase } from '@/db/client';
import { EMPTY_CURSOR, type TableCursor } from './cursor';
import type { SyncStatus, SyncTable } from './types';

const KEYS = {
  lastPullAt: 'sync_last_pull_at',
  lastPushAt: 'sync_last_push_at',
  cursor: 'sync_cursor',
  status: 'sync_status',
  lastError: 'sync_last_error',
} as const;

const TABLE_CURSOR_PREFIX = 'sync_cursor:';

async function getMeta(key: string): Promise<string | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM schema_meta WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

async function setMeta(key: string, value: string): Promise<void> {
  const db = await openDatabase();
  await db.runAsync(
    'INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const [lastPull, lastPush, cursor, status, lastError] = await Promise.all([
    getMeta(KEYS.lastPullAt),
    getMeta(KEYS.lastPushAt),
    getMeta(KEYS.cursor),
    getMeta(KEYS.status),
    getMeta(KEYS.lastError),
  ]);
  return {
    lastPullAt: lastPull ? Number(lastPull) : null,
    lastPushAt: lastPush ? Number(lastPush) : null,
    cursor: cursor ? Number(cursor) : 0,
    status: (status as SyncStatus['status']) || 'idle',
    lastError: lastError || null,
  };
}

export async function setSyncStatus(
  patch: Partial<Pick<SyncStatus, 'status' | 'lastError' | 'lastPullAt' | 'lastPushAt' | 'cursor'>>,
): Promise<void> {
  if (patch.status !== undefined) await setMeta(KEYS.status, patch.status);
  if (patch.lastError !== undefined) await setMeta(KEYS.lastError, patch.lastError ?? '');
  if (patch.lastPullAt !== undefined) await setMeta(KEYS.lastPullAt, String(patch.lastPullAt));
  if (patch.lastPushAt !== undefined) await setMeta(KEYS.lastPushAt, String(patch.lastPushAt));
  if (patch.cursor !== undefined) await setMeta(KEYS.cursor, String(patch.cursor));
}

export async function resetSyncState(): Promise<void> {
  const db = await openDatabase();
  for (const key of Object.values(KEYS)) {
    await db.runAsync('DELETE FROM schema_meta WHERE key = ?', key);
  }
  await db.runAsync('DELETE FROM schema_meta WHERE key LIKE ?', `${TABLE_CURSOR_PREFIX}%`);
}

function parseCursor(raw: string | null): TableCursor | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<TableCursor>;
    return {
      ts: typeof c.ts === 'string' ? c.ts : null,
      id: typeof c.id === 'string' ? c.id : null,
      retry: c.retry && typeof c.retry === 'object' ? c.retry : {},
    };
  } catch {
    return null;
  }
}

/**
 * Per-table pull cursors (#140). First call after upgrade seeds every table
 * from the old shared ms cursor (id = null → inclusive `>=` fetch, harmless
 * re-apply) and deletes it, so a table added later starts from zero instead
 * of inheriting a position it never pulled to.
 */
export async function getTableCursors(
  tables: readonly SyncTable[],
): Promise<Record<string, TableCursor>> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM schema_meta WHERE key LIKE ?',
    `${TABLE_CURSOR_PREFIX}%`,
  );
  const out: Record<string, TableCursor> = {};
  for (const r of rows) {
    const c = parseCursor(r.value);
    if (c) out[r.key.slice(TABLE_CURSOR_PREFIX.length)] = c;
  }

  const legacy = Number(await getMeta(KEYS.cursor));
  if (Number.isFinite(legacy) && legacy > 0) {
    const seed: TableCursor = { ...EMPTY_CURSOR, ts: new Date(legacy).toISOString() };
    for (const t of tables) {
      if (out[t]) continue;
      out[t] = seed;
      await setTableCursor(t, seed);
    }
    await db.runAsync('DELETE FROM schema_meta WHERE key = ?', KEYS.cursor);
  }

  for (const t of tables) out[t] ??= EMPTY_CURSOR;
  return out;
}

export async function setTableCursor(table: SyncTable, cursor: TableCursor): Promise<void> {
  await setMeta(`${TABLE_CURSOR_PREFIX}${table}`, JSON.stringify(cursor));
}
