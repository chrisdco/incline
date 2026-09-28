import type { SQLiteDatabase } from 'expo-sqlite';

import { hasColumn } from './helpers';
import type { Migration } from './types';

/**
 * Precomputed search blob for exercise lookup (name + muscle + equipment,
 * lowercased with punctuation flattened). Local-only display aid like 017 —
 * never synced. SQL approximation of buildSearchText (no diacritic folding
 * in SQLite); the JS ranker folds fully at match time.
 */
export const migration019: Migration = {
  version: 19,
  name: 'exercise_search_text',
  async up(db: SQLiteDatabase) {
    if (!(await hasColumn(db, 'exercises', 'search_text'))) {
      await db.execAsync('ALTER TABLE exercises ADD COLUMN search_text TEXT');
    }
    await db.execAsync(`
      UPDATE exercises SET search_text = trim(
        lower(
          replace(replace(replace(coalesce(name, ''), '(', ' '), ')', ' '), ',', ' ')
          || ' ' || coalesce(primary_muscle, '')
          || ' ' || coalesce(equipment, '')
          || ' ' || coalesce(movement_pattern, '')
          || ' ' || coalesce(category, '')
        )
      ) WHERE search_text IS NULL
    `);
    await db.execAsync(
      'CREATE INDEX IF NOT EXISTS idx_exercises_search_text ON exercises(search_text)',
    );
  },
};
