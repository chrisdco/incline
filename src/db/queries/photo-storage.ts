import { PHOTO_BLOB_MAX_ATTEMPTS } from '@/sync/photo-blobs';

import { openDatabase } from '../client';
import { mutate } from '../write';

/** Tables the storage readout reads (query keys lead with these). */
export const PHOTO_STORAGE_TABLES = ['workout_photos', 'photo_blob_queue'] as const;

export interface PhotoStorageStats {
  /** Live photos on this device. */
  count: number;
  /** Their compressed size on disk (bytes recorded at capture/download). */
  bytes: number;
  /** Uploads/deletes parked after repeated failures, waiting for a retry. */
  stuck: number;
}

/** One aggregate query for the Settings readout (#193). */
export async function getPhotoStorageStats(): Promise<PhotoStorageStats> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ count: number; bytes: number | null; stuck: number }>(
    `SELECT
       (SELECT COUNT(*) FROM workout_photos WHERE deleted_at IS NULL) AS count,
       (SELECT SUM(COALESCE(byte_size, 0)) FROM workout_photos WHERE deleted_at IS NULL) AS bytes,
       (SELECT COUNT(*) FROM photo_blob_queue WHERE attempts >= ?) AS stuck`,
    PHOTO_BLOB_MAX_ATTEMPTS,
  );
  return { count: row?.count ?? 0, bytes: row?.bytes ?? 0, stuck: row?.stuck ?? 0 };
}

/** Re-arm parked photo transfers; the next sync drains them (#147 DLQ). */
export async function retryStuckPhotoTransfers(): Promise<number> {
  return mutate(['photo_blob_queue'], async (tx) => {
    const res = await tx.runAsync(
      'UPDATE photo_blob_queue SET attempts = 0, next_attempt_at = ? WHERE attempts >= ?',
      Date.now(),
      PHOTO_BLOB_MAX_ATTEMPTS,
    );
    return res.changes;
  });
}

/** "12 photos · 3.4 MB" — MB with one decimal under 10, whole above. */
export function formatPhotoStorage(stats: Pick<PhotoStorageStats, 'count' | 'bytes'>): string {
  if (stats.count === 0) return 'No photos on this device';
  const mb = stats.bytes / (1024 * 1024);
  const size = mb < 10 ? mb.toFixed(1) : String(Math.round(mb));
  return `${stats.count} photo${stats.count === 1 ? '' : 's'} · ${size} MB`;
}
