import type { SQLiteDatabase } from 'expo-sqlite';

import { hasTable } from './helpers';
import type { Migration } from './types';

/**
 * Routine version history (docs/decisions/ROUTINE-CHANGES.md): the routine's
 * state right before a workout updates it or a version is restored, so any
 * change can be looked at and undone later. Local-only for now (not synced).
 * `rows_json` is the TemplateSnapshot rows; ids point at template_exercises
 * rows, which are only ever soft-deleted, so a restore revives the same rows.
 */
export const TEMPLATE_VERSIONS_DDL = [
  `CREATE TABLE IF NOT EXISTS template_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    rows_json TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_template_versions_template ON template_versions(template_id, created_at)`,
];

export const migration027: Migration = {
  version: 27,
  name: 'template_versions',
  async up(db: SQLiteDatabase) {
    if (!(await hasTable(db, 'template_versions'))) {
      for (const stmt of TEMPLATE_VERSIONS_DDL) await db.execAsync(stmt);
    }
  },
};
