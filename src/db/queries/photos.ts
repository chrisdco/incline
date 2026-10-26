import { copyAsync, deleteAsync, documentDirectory, makeDirectoryAsync } from 'expo-file-system/legacy';

import { PAGINATION } from '@/constants/config';
import { newUuid } from '@/lib/uuid';
import type { ProgressPhoto, WorkoutPhoto } from '../types';
import { openDatabase } from '../client';
import { mutate, type Tx } from '../write';
import { enqueueSync } from '@/sync/outbox';
import { checksumFile, compressPhotoToJpeg, enqueuePhotoBlob, localPhotoPath } from '@/sync/photo-blobs';

export const MAX_SESSION_PHOTOS = 6;

interface PhotoRow {
  id: number;
  workout_log_id: number;
  uri: string;
  sort_order: number;
  created_at: number;
}

function mapPhoto(r: PhotoRow): WorkoutPhoto {
  return {
    id: r.id,
    workoutLogId: r.workout_log_id,
    uri: r.uri,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  };
}

export async function listWorkoutPhotos(logId: number): Promise<WorkoutPhoto[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<PhotoRow>(
    `SELECT id, workout_log_id, uri, sort_order, created_at
     FROM workout_photos
     WHERE workout_log_id = ? AND deleted_at IS NULL
     ORDER BY sort_order, id`,
    logId,
  );
  return rows.map(mapPhoto);
}

async function persistPhotoFile(logId: number, sourceUri: string, photoUuid: string): Promise<{
  uri: string;
  byteSize: number;
  checksum: string;
}> {
  const compressed = await compressPhotoToJpeg(sourceUri);
  const dest = localPhotoPath(logId, photoUuid);
  const dir = `${documentDirectory}workout-photos/${logId}/`;
  await makeDirectoryAsync(dir, { intermediates: true });
  await copyAsync({ from: compressed, to: dest });
  const meta = await checksumFile(dest);
  return { uri: dest, byteSize: meta.byteSize, checksum: meta.checksum };
}

const PHOTO_TABLES = ['workout_photos'] as const;

async function enqueuePhotoMetadata(tx: Tx, photoId: number): Promise<void> {
  const row = await tx.getFirstAsync<{
    uuid: string | null;
    log_uuid: string | null;
    storage_path: string | null;
    content_type: string | null;
    byte_size: number | null;
    checksum: string | null;
    sort_order: number;
    created_at: number;
    updated_at: number;
    deleted_at: number | null;
  }>(
    `SELECT p.uuid, p.storage_path, p.content_type, p.byte_size, p.checksum, p.sort_order,
            p.created_at, p.updated_at, p.deleted_at, w.uuid as log_uuid
     FROM workout_photos p
     JOIN workout_logs w ON w.id = p.workout_log_id
     WHERE p.id = ?`,
    photoId,
  );
  if (!row?.uuid || !row.log_uuid) return;
  await enqueueSync('workout_photos', row.uuid, row.deleted_at ? 'delete' : 'upsert', {
    workout_log_uuid: row.log_uuid,
    storage_path: row.storage_path,
    content_type: row.content_type ?? 'image/jpeg',
    byte_size: row.byte_size,
    checksum: row.checksum,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  }, tx);
}

/**
 * File I/O stays outside the transaction: each photo is copied into the app
 * directory first, then its row + outbox entry commit in one mutate(). If the
 * DB write fails the copied file is removed so nothing is orphaned.
 */
export async function addWorkoutPhotos(logId: number, sourceUris: string[]): Promise<WorkoutPhoto[]> {
  const existing = await listWorkoutPhotos(logId);
  const room = MAX_SESSION_PHOTOS - existing.length;
  if (room <= 0 || sourceUris.length === 0) return existing;

  const now = Date.now();
  let sort = existing.length === 0 ? 0 : existing[existing.length - 1].sortOrder + 1;
  const added: WorkoutPhoto[] = [];

  for (const uri of sourceUris.slice(0, room)) {
    const uuid = newUuid();
    const local = await persistPhotoFile(logId, uri, uuid);
    const sortOrder = sort;
    let photoId: number;
    try {
      photoId = await mutate(PHOTO_TABLES, async (tx) => {
        const res = await tx.runAsync(
          `INSERT INTO workout_photos (workout_log_id, uri, sort_order, uuid, created_at, updated_at, content_type, byte_size, checksum)
           VALUES (?, ?, ?, ?, ?, ?, 'image/jpeg', ?, ?)`,
          logId,
          local.uri,
          sortOrder,
          uuid,
          now,
          now,
          local.byteSize,
          local.checksum,
        );
        const id = Number(res.lastInsertRowId);
        await enqueuePhotoMetadata(tx, id);
        return id;
      });
    } catch (err) {
      await deleteAsync(local.uri, { idempotent: true }).catch(() => {});
      throw err;
    }
    added.push({
      id: photoId,
      workoutLogId: logId,
      uri: local.uri,
      sortOrder,
      createdAt: now,
    });
    void enqueuePhotoBlob(uuid, 'upload').catch(() => {});
    sort += 1;
  }
  return [...existing, ...added];
}

async function deleteLocalPhotoFile(uri: string): Promise<void> {
  if (!uri.includes('workout-photos/')) return;
  try {
    await deleteAsync(uri, { idempotent: true });
  } catch {
    /* file may already be gone */
  }
}

/** Soft-delete commits first; the local file goes only after it has. */
export async function deleteWorkoutPhoto(photoId: number): Promise<void> {
  const now = Date.now();
  const row = await mutate(PHOTO_TABLES, async (tx) => {
    const r = await tx.getFirstAsync<PhotoRow & { uuid: string | null; storage_path: string | null }>(
      'SELECT id, workout_log_id, uri, sort_order, created_at, uuid, storage_path FROM workout_photos WHERE id = ? AND deleted_at IS NULL',
      photoId,
    );
    await tx.runAsync(
      'UPDATE workout_photos SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
      now,
      now,
      photoId,
    );
    await enqueuePhotoMetadata(tx, photoId);
    return r;
  });
  if (row) await deleteLocalPhotoFile(row.uri);
  if (row?.uuid) {
    void enqueuePhotoBlob(row.uuid, 'delete', row.storage_path).catch(() => {});
  }
}

export async function deletePhotosForWorkout(logId: number): Promise<void> {
  const now = Date.now();
  const rows = await mutate(PHOTO_TABLES, async (tx) => {
    const live = await tx.getAllAsync<{ id: number; uri: string; uuid: string | null; storage_path: string | null }>(
      'SELECT id, uri, uuid, storage_path FROM workout_photos WHERE workout_log_id = ? AND deleted_at IS NULL',
      logId,
    );
    await tx.runAsync(
      'UPDATE workout_photos SET deleted_at = ?, updated_at = ? WHERE workout_log_id = ? AND deleted_at IS NULL',
      now,
      now,
      logId,
    );
    for (const r of live) {
      if (r.uuid) await enqueuePhotoMetadata(tx, r.id);
    }
    return live;
  });
  for (const r of rows) await deleteLocalPhotoFile(r.uri);
  for (const r of rows) {
    if (!r.uuid) continue;
    void enqueuePhotoBlob(r.uuid, 'delete', r.storage_path).catch(() => {});
  }
}

interface ProgressPhotoRow {
  id: number;
  workout_log_id: number;
  uri: string;
  sort_order: number;
  created_at: number;
  workout_name: string;
  started_at: number;
  ended_at: number | null;
  template_id: number | null;
}

function mapProgressPhoto(r: ProgressPhotoRow): ProgressPhoto {
  return {
    id: r.id,
    workoutLogId: r.workout_log_id,
    uri: r.uri,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    workoutName: r.workout_name,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    templateId: r.template_id,
  };
}

const PROGRESS_PHOTO_FROM = `
FROM workout_photos p
INNER JOIN workout_logs w ON w.id = p.workout_log_id
WHERE p.deleted_at IS NULL
  AND w.deleted_at IS NULL
  AND w.ended_at IS NOT NULL`;

const PROGRESS_PHOTO_SELECT = `
SELECT
  p.id,
  p.workout_log_id,
  p.uri,
  p.sort_order,
  p.created_at,
  w.name AS workout_name,
  w.started_at,
  w.ended_at,
  w.template_id
${PROGRESS_PHOTO_FROM}`;

const PROGRESS_PHOTO_ORDER = 'ORDER BY w.started_at ASC, p.sort_order, p.id';

export async function listProgressPhotos({
  offset = 0,
  limit = PAGINATION.pageSize,
  sinceMs,
}: {
  offset?: number;
  limit?: number;
  sinceMs?: number;
} = {}): Promise<ProgressPhoto[]> {
  const db = await openDatabase();
  const sinceClause = sinceMs != null && sinceMs > 0 ? ' AND w.started_at >= ?' : '';
  const params: number[] = [];
  if (sinceClause) params.push(sinceMs as number);
  params.push(limit, offset);
  const rows = await db.getAllAsync<ProgressPhotoRow>(
    `${PROGRESS_PHOTO_SELECT}${sinceClause}
     ${PROGRESS_PHOTO_ORDER}
     LIMIT ? OFFSET ?`,
    ...params,
  );
  return rows.map(mapProgressPhoto);
}

export async function countProgressPhotos(): Promise<number> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n ${PROGRESS_PHOTO_FROM}`);
  return row?.n ?? 0;
}

export async function getProgressPhotoById(id: number): Promise<ProgressPhoto | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<ProgressPhotoRow>(
    `${PROGRESS_PHOTO_SELECT} AND p.id = ?`,
    id,
  );
  return row ? mapProgressPhoto(row) : null;
}
