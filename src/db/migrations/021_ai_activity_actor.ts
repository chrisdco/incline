import type { SQLiteDatabase } from 'expo-sqlite';

import { hasColumn } from './helpers';
import type { Migration } from './types';

/**
 * Who applied an AI change, and on which device (AI-PLATFORM §5): the
 * in-app AI, the web, an MCP client or a recipe. Rows from before 021 were
 * all in-app, so they default to `app_ai` with an unknown device.
 */
export const migration021: Migration = {
  version: 21,
  name: 'ai_activity_actor',
  async up(db: SQLiteDatabase) {
    if (!(await hasColumn(db, 'ai_activity', 'actor'))) {
      await db.execAsync(`ALTER TABLE ai_activity ADD COLUMN actor TEXT NOT NULL DEFAULT 'app_ai'`);
    }
    if (!(await hasColumn(db, 'ai_activity', 'device_id'))) {
      await db.execAsync('ALTER TABLE ai_activity ADD COLUMN device_id TEXT');
    }
  },
};
