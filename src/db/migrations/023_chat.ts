import type { SQLiteDatabase } from 'expo-sqlite';

import { hasTable } from './helpers';
import type { Migration } from './types';

/**
 * Ask chat threads (AI-CHAT §4). Messages store our own ChatPart JSON with a
 * version (`v`), never a library's format, plus who answered (model,
 * provider, prompt_version) so old answers stay explainable. Local only for
 * now; uuids are there so opt-in sync is a flag, not a migration.
 * Fresh installs build these from here too (schema.ts spreads CHAT_DDL).
 */
export const CHAT_DDL = [
  `CREATE TABLE IF NOT EXISTS chat_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    context_kind TEXT,
    context_id TEXT,
    memory_off INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_threads_uuid ON chat_threads(uuid)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_threads_updated ON chat_threads(updated_at)`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL,
    thread_uuid TEXT NOT NULL,
    role TEXT NOT NULL,
    parts_json TEXT NOT NULL,
    v INTEGER NOT NULL DEFAULT 1,
    model TEXT,
    provider TEXT,
    prompt_version TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_uuid ON chat_messages(uuid)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_uuid, created_at)`,
];

export const migration023: Migration = {
  version: 23,
  name: 'chat',
  async up(db: SQLiteDatabase) {
    if (!(await hasTable(db, 'chat_messages'))) {
      for (const stmt of CHAT_DDL) await db.execAsync(stmt);
    }
  },
};
