import type { SQLiteDatabase } from 'expo-sqlite';

import { hasColumn } from './helpers';
import type { Migration } from './types';

/**
 * Exercise display order inside a session. Previously derived from row
 * insertion order (`ORDER BY s.id`), which made reorder impossible.
 * Local-only display state (like 017 notes): never enqueued to sync, never
 * deployed to Supabase. NULL (legacy rows) falls back to insertion order.
 */
export const migration018: Migration = {
  version: 18,
  name: 'set_sort_order',
  async up(db: SQLiteDatabase) {
    if (!(await hasColumn(db, 'set_entries', 'sort_order'))) {
      await db.execAsync('ALTER TABLE set_entries ADD COLUMN sort_order INTEGER');
    }
    await db.execAsync('UPDATE set_entries SET sort_order = id WHERE sort_order IS NULL');
  },
};
