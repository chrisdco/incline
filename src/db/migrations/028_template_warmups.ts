import type { SQLiteDatabase } from 'expo-sqlite';

import { hasColumn } from './helpers';
import type { Migration } from './types';

/**
 * Warm-up sets per routine row (WORK-QUEUE 7). Starting the routine creates
 * this many warm-up rows ahead of the working sets; 0 = none.
 */
export const migration028: Migration = {
  version: 28,
  name: 'template_warmups',
  async up(db: SQLiteDatabase) {
    if (!(await hasColumn(db, 'template_exercises', 'warmup_sets'))) {
      await db.execAsync('ALTER TABLE template_exercises ADD COLUMN warmup_sets INTEGER NOT NULL DEFAULT 0');
    }
  },
};
