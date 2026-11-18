import type { SQLiteDatabase } from 'expo-sqlite';

import { hasTable } from './helpers';
import type { Migration } from './types';

/**
 * Progression decisions (PROGRESSION.md §4): what happened to each plateau
 * fix — proposed, applied, declined, done, reverted — and who started it.
 * Synced, so the MCP server and the web report the same state, and so a
 * proposal made in Claude or on the web reaches the phone's inbox.
 * `exercise_ref` is the synced ref key (`catalog:…` / `custom:…`), never a
 * local id. `activity_id` links the local ai_activity row (not synced).
 * Fresh installs build the table from here too (schema.ts spreads the DDL).
 */
export const PROGRESSION_DDL = [
  `CREATE TABLE IF NOT EXISTS progression_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    exercise_ref TEXT NOT NULL,
    exercise_name TEXT NOT NULL DEFAULT '',
    remedy TEXT NOT NULL,
    params TEXT,
    status TEXT NOT NULL,
    source TEXT NOT NULL,
    rationale TEXT NOT NULL DEFAULT '',
    rule_version TEXT NOT NULL DEFAULT '',
    resume_after_sessions INTEGER,
    activity_id INTEGER,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    updated_at INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_progression_decisions_uuid ON progression_decisions(uuid)`,
  `CREATE INDEX IF NOT EXISTS idx_progression_decisions_ref ON progression_decisions(exercise_ref, created_at)`,
];

export const migration024: Migration = {
  version: 24,
  name: 'progression_decisions',
  async up(db: SQLiteDatabase) {
    if (!(await hasTable(db, 'progression_decisions'))) {
      for (const stmt of PROGRESSION_DDL) await db.execAsync(stmt);
    }
  },
};
