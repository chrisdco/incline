import type { SQLiteDatabase } from 'expo-sqlite';

import { hasTable } from './helpers';
import type { Migration } from './types';

/**
 * Ask memory (AI-CHAT §5): structured facts the user owns. Synced, so the
 * MCP server and the web read the same facts. `status` is 'suggested'
 * (inferred, does nothing yet) or 'confirmed'. Fresh installs build the
 * table from here too (schema.ts spreads the DDL).
 */
export const COACH_MEMORY_DDL = [
  `CREATE TABLE IF NOT EXISTS coach_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    source TEXT NOT NULL,
    source_ref TEXT,
    confidence REAL NOT NULL DEFAULT 1,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    expires_at INTEGER,
    updated_at INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_memory_uuid ON coach_memory(uuid)`,
];

export const migration026: Migration = {
  version: 26,
  name: 'coach_memory',
  async up(db: SQLiteDatabase) {
    if (!(await hasTable(db, 'coach_memory'))) {
      for (const stmt of COACH_MEMORY_DDL) await db.execAsync(stmt);
    }
  },
};
