import type { SQLiteDatabase } from 'expo-sqlite';

import { hasColumn, hasTable } from './helpers';
import type { Migration } from './types';

/** Photo cloud identity: metadata columns + durable blob queue. Bytes never go in the JSON outbox. */
export const migration016: Migration = {
  version: 16,
  name: 'photo_sync_metadata',
  async up(db: SQLiteDatabase) {
    if (await hasTable(db, 'workout_photos')) {
      if (!(await hasColumn(db, 'workout_photos', 'storage_path'))) {
        await db.execAsync('ALTER TABLE workout_photos ADD COLUMN storage_path TEXT');
      }
      if (!(await hasColumn(db, 'workout_photos', 'content_type'))) {
        await db.execAsync(
          "ALTER TABLE workout_photos ADD COLUMN content_type TEXT NOT NULL DEFAULT 'image/jpeg'",
        );
      }
      if (!(await hasColumn(db, 'workout_photos', 'byte_size'))) {
        await db.execAsync('ALTER TABLE workout_photos ADD COLUMN byte_size INTEGER');
      }
      if (!(await hasColumn(db, 'workout_photos', 'checksum'))) {
        await db.execAsync('ALTER TABLE workout_photos ADD COLUMN checksum TEXT');
      }
      await db.execAsync(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_photos_uuid ON workout_photos(uuid)',
      );
    }

    if (!(await hasTable(db, 'photo_blob_queue'))) {
      await db.execAsync(`
        CREATE TABLE photo_blob_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          photo_uuid TEXT NOT NULL,
          op TEXT NOT NULL,
          storage_path TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          next_attempt_at INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        )
      `);
      await db.execAsync(
        'CREATE INDEX IF NOT EXISTS idx_photo_blob_queue_due ON photo_blob_queue(next_attempt_at, id)',
      );
    }
  },
};
