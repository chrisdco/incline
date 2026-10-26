/**
 * Per-table paged pull (#140).
 *
 * Each table keeps its own (updated_at, id) cursor and pages until the
 * server returns a short page, so a big restore lands in one run. Every page
 * is applied in one SQLite transaction (the caller's `applyPage`) and the
 * cursor is saved right after, so a kill mid-restore resumes from the last
 * whole page. Blocked rows are re-fetched by id on later runs instead of
 * pinning the cursor.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { foldPage, settleRetries, type ApplyStatus, type TableCursor } from './cursor';
import type { SyncTable } from './types';

export const PULL_PAGE = 500;
const RETRY_FETCH_CHUNK = 100;

export interface PullSpec {
  table: SyncTable;
  cloud: string;
  idCol: string;
}

export type RemoteRow = Record<string, unknown>;

export interface PullSource {
  /** Rows strictly after the cursor, ordered (updated_at, idCol), at most `limit`. */
  fetchPage(spec: PullSpec, cursor: TableCursor, limit: number): Promise<RemoteRow[]>;
  fetchByIds(spec: PullSpec, ids: string[]): Promise<RemoteRow[]>;
}

export type ApplyPage = (table: SyncTable, rows: RemoteRow[]) => Promise<ApplyStatus[]>;

function rowKey(spec: PullSpec, row: RemoteRow): { ts: string; id: string } {
  return { ts: String(row.updated_at ?? ''), id: String(row[spec.idCol] ?? '') };
}

export async function pullTable(
  spec: PullSpec,
  start: TableCursor,
  source: PullSource,
  applyPage: ApplyPage,
  save: (cursor: TableCursor) => Promise<void>,
): Promise<TableCursor> {
  let cursor = start;

  const retryIds = Object.keys(cursor.retry);
  if (retryIds.length > 0) {
    const results: { id: string; status: ApplyStatus }[] = [];
    for (let i = 0; i < retryIds.length; i += RETRY_FETCH_CHUNK) {
      const rows = await source.fetchByIds(spec, retryIds.slice(i, i + RETRY_FETCH_CHUNK));
      if (rows.length === 0) continue;
      const statuses = await applyPage(spec.table, rows);
      rows.forEach((row, j) => results.push({ id: rowKey(spec, row).id, status: statuses[j] }));
    }
    cursor = settleRetries(cursor, results);
    await save(cursor);
  }

  for (;;) {
    const rows = await source.fetchPage(spec, cursor, PULL_PAGE);
    if (rows.length === 0) break;
    const statuses = await applyPage(spec.table, rows);
    cursor = foldPage(
      cursor,
      rows.map((row, j) => ({ ...rowKey(spec, row), status: statuses[j] })),
    );
    await save(cursor);
    if (rows.length < PULL_PAGE) break;
  }

  return cursor;
}

/** PostgREST logic-tree value: quoted so ':', '.', '+' in timestamps parse as data. */
function q(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Tuple filter for "strictly after (ts, id)"; id null = seeded from the legacy ms cursor (inclusive). */
export function cursorFilter(spec: PullSpec, cursor: TableCursor): string | null {
  if (!cursor.ts) return null;
  if (cursor.id == null) return `updated_at.gte.${q(cursor.ts)}`;
  return `updated_at.gt.${q(cursor.ts)},and(updated_at.eq.${q(cursor.ts)},${spec.idCol}.gt.${q(cursor.id)})`;
}

export function supabasePullSource(client: SupabaseClient, userId: string): PullSource {
  return {
    async fetchPage(spec, cursor, limit) {
      let query = client.from(spec.cloud).select('*').eq('user_id', userId);
      const filter = cursorFilter(spec, cursor);
      if (filter) query = query.or(filter);
      const { data, error } = await query
        .order('updated_at', { ascending: true })
        .order(spec.idCol, { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as RemoteRow[];
    },
    async fetchByIds(spec, ids) {
      const { data, error } = await client
        .from(spec.cloud)
        .select('*')
        .eq('user_id', userId)
        .in(spec.idCol, ids);
      if (error) throw error;
      return (data ?? []) as RemoteRow[];
    },
  };
}
