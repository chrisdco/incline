import type { SQLiteDatabase } from 'expo-sqlite';

import { hasTable } from './helpers';
import type { Migration } from './types';

/**
 * AI transparency + feedback (AI-ARCHITECTURE §1b). `ai_activity` records
 * every AI-originated change with before/after so it can be listed and
 * reverted; `ai_feedback` records proposal outcomes (applied / edited /
 * rejected / regenerated) for personalisation. Local-only for now.
 * Fresh installs get the 021 columns (actor, device_id) here too.
 */
export const AI_ACTIVITY_DDL = [
  `CREATE TABLE IF NOT EXISTS ai_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL,
    task TEXT NOT NULL,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    status TEXT NOT NULL DEFAULT 'applied',
    actor TEXT NOT NULL DEFAULT 'app_ai',
    device_id TEXT,
    created_at INTEGER NOT NULL,
    reverted_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_activity_created ON ai_activity(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_activity_proposal ON ai_activity(proposal_id)`,
  `CREATE TABLE IF NOT EXISTS ai_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_id TEXT NOT NULL,
    task TEXT NOT NULL,
    outcome TEXT NOT NULL,
    reason TEXT,
    edit_diff_json TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ai_feedback_task ON ai_feedback(task, created_at)`,
];

export const migration020: Migration = {
  version: 20,
  name: 'ai_activity',
  async up(db: SQLiteDatabase) {
    if (await hasTable(db, 'ai_activity')) return;
    for (const stmt of AI_ACTIVITY_DDL) await db.execAsync(stmt);
  },
};
