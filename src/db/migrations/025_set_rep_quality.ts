import type { SQLiteDatabase } from 'expo-sqlite';

import { hasColumn } from './helpers';
import type { Migration } from './types';

/** Optional rep quality per set ('dirty' = form broke). NULL = not marked. */
export const migration025: Migration = {
  version: 25,
  name: 'set_rep_quality',
  async up(db: SQLiteDatabase) {
    if (!(await hasColumn(db, 'set_entries', 'rep_quality'))) {
      await db.execAsync('ALTER TABLE set_entries ADD COLUMN rep_quality TEXT');
    }
  },
};
