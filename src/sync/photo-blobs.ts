import * as Crypto from 'expo-crypto';
import { File, Directory } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { documentDirectory } from 'expo-file-system/legacy';
import type { SupabaseClient } from '@supabase/supabase-js';

import { openDatabase } from '@/db/client';
import { getLocalAccountOwner } from '@/db/account';
import { mutate, type Tx } from '@/db/write';
import { captureError } from '@/lib/error-sink';
import { getAuthedSupabase, type GetToken } from './supabase-auth';
import { enqueueSync } from './outbox';

const BUCKET = 'workout-photos';
const MAX_ATTEMPTS = 8;
const CONCURRENCY = 2;

/**
 * Queue a blob transfer. Pass the tx of the write that needs it so the job
 * commits with that row (#138) — never fire-and-forget.
 */
export async function enqueuePhotoBlob(
  photoUuid: string,
  op: 'upload' | 'download' | 'delete',
  storagePath?: string | null,
  tx?: Tx,
): Promise<void> {
  const db = tx ?? (await openDatabase());
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO photo_blob_queue (photo_uuid, op, storage_path, attempts, next_attempt_at, created_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
    photoUuid,
    op,
    storagePath ?? null,
    now,
    now,
  );
}

/** A job that failed this many times is parked (dead-lettered), never dropped. */
export const PHOTO_BLOB_MAX_ATTEMPTS = MAX_ATTEMPTS;

const QUEUE_TABLES = ['photo_blob_queue'] as const;

export async function drainPhotoBlobs(opts: {
  userId: string;
  getToken: GetToken;
}): Promise<void> {
  const db = await openDatabase();
  const now = Date.now();
  // Parked jobs (attempts >= MAX) wait for a manual retry
  // (retryStuckPhotoTransfers) instead of being deleted (#147).
  const jobs = await db.getAllAsync<{
    id: number;
    photo_uuid: string;
    op: string;
    storage_path: string | null;
    attempts: number;
  }>(
    `SELECT id, photo_uuid, op, storage_path, attempts FROM photo_blob_queue
     WHERE next_attempt_at <= ? AND attempts < ? ORDER BY id ASC LIMIT 8`,
    now,
    MAX_ATTEMPTS,
  );
  if (jobs.length === 0) {
    // Queue idle: safe moment to sweep files no live row points at.
    void cleanupOrphanPhotoFilesOnce();
    return;
  }

  const client = await getAuthedSupabase(opts.getToken);
  if (!client) return;

  const workers = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async (_, slot) => {
    for (let i = slot; i < jobs.length; i += CONCURRENCY) {
      const job = jobs[i];
      try {
        if (job.op === 'upload') await uploadPhoto(client, opts.userId, job.photo_uuid);
        else if (job.op === 'download') await downloadPhoto(client, job.photo_uuid, job.storage_path);
        else if (job.op === 'delete') await deleteCloudPhoto(client, job.photo_uuid, job.storage_path);
        await mutate(QUEUE_TABLES, async (tx) => {
          await tx.runAsync('DELETE FROM photo_blob_queue WHERE id = ?', job.id);
        });
      } catch (err) {
        const attempts = job.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          captureError(err, { where: 'photos.blob', op: job.op, attempts, parked: true });
        }
        const delay = Math.min(30 * 60 * 1000, 2000 * 2 ** attempts);
        await mutate(QUEUE_TABLES, async (tx) => {
          await tx.runAsync(
            'UPDATE photo_blob_queue SET attempts = ?, next_attempt_at = ? WHERE id = ?',
            attempts,
            Date.now() + delay,
            job.id,
          );
        });
      }
    }
  });
  await Promise.all(workers);
}

let orphanSweepDone = false;

/** Once per app run, best-effort: never blocks or fails the drain. */
async function cleanupOrphanPhotoFilesOnce(): Promise<void> {
  if (orphanSweepDone) return;
  orphanSweepDone = true;
  try {
    const { cleanupOrphanPhotoFiles } = await import('./photo-orphans');
    await cleanupOrphanPhotoFiles();
  } catch (err) {
    captureError(err, { where: 'photos.orphans' });
  }
}

export async function compressPhotoToJpeg(sourceUri: string): Promise<string> {
  const context = ImageManipulator.manipulate(sourceUri);
  context.resize({ width: 1600 });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return saved.uri;
}

export async function checksumFile(uri: string): Promise<{ byteSize: number; checksum: string }> {
  const file = new File(uri);
  const buf = await file.arrayBuffer();
  const checksumBuf = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, buf);
  const checksum = [...new Uint8Array(checksumBuf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { byteSize: buf.byteLength, checksum };
}

async function uploadPhoto(
  client: SupabaseClient,
  userId: string,
  photoUuid: string,
): Promise<void> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{
    uri: string;
    checksum: string | null;
    content_type: string | null;
    log_uuid: string | null;
    storage_path: string | null;
    sort_order: number;
    created_at: number;
    updated_at: number;
    deleted_at: number | null;
  }>(
    `SELECT p.uri, p.checksum, p.content_type, p.storage_path, p.sort_order, p.created_at, p.updated_at, p.deleted_at,
            w.uuid as log_uuid
     FROM workout_photos p
     JOIN workout_logs w ON w.id = p.workout_log_id
     WHERE p.uuid = ?`,
    photoUuid,
  );
  if (!row?.uri || !row.log_uuid) return;
  // Deleted before its upload ran: nothing to send (the delete job covers
  // any blob an earlier attempt left behind).
  if (row.deleted_at) return;
  const owner = (await getLocalAccountOwner()) ?? userId;
  const path = row.storage_path ?? `${owner}/${row.log_uuid}/${photoUuid}.jpg`;
  const file = new File(row.uri);
  if (!file.exists) throw new Error('local photo missing');
  const buf = await file.arrayBuffer();
  const { error } = await client.storage.from(BUCKET).upload(path, buf, {
    upsert: true,
    contentType: row.content_type ?? 'image/jpeg',
  });
  if (error) throw error;
  const now = Date.now();
  // One transaction: a bumped updated_at with no outbox row would never push
  // (pull LWW sees local as newer), so the two commit together (#137).
  await mutate(['workout_photos', 'photo_blob_queue'], async (tx) => {
    // Re-read inside the tx: a delete may have committed mid-upload, and its
    // cloud-delete job could already have run with no path to remove.
    const current = await tx.getFirstAsync<{ deleted_at: number | null }>(
      'SELECT deleted_at FROM workout_photos WHERE uuid = ?',
      photoUuid,
    );
    const deletedAt = current?.deleted_at ?? null;
    await tx.runAsync(
      'UPDATE workout_photos SET storage_path = ?, updated_at = ? WHERE uuid = ?',
      path,
      now,
      photoUuid,
    );
    if (deletedAt) await enqueuePhotoBlob(photoUuid, 'delete', path, tx);
    await enqueueSync('workout_photos', photoUuid, deletedAt ? 'delete' : 'upsert', {
      workout_log_uuid: row.log_uuid,
      storage_path: path,
      content_type: row.content_type ?? 'image/jpeg',
      byte_size: buf.byteLength,
      checksum: row.checksum,
      sort_order: row.sort_order,
      created_at: row.created_at,
      updated_at: now,
      deleted_at: deletedAt,
    }, tx);
  });
}

async function downloadPhoto(
  client: SupabaseClient,
  photoUuid: string,
  storagePath: string | null,
): Promise<void> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{
    uri: string;
    storage_path: string | null;
    log_id: number;
    deleted_at: number | null;
  }>(
    `SELECT p.uri, p.storage_path, p.workout_log_id as log_id, p.deleted_at
     FROM workout_photos p WHERE p.uuid = ?`,
    photoUuid,
  );
  const path = storagePath ?? row?.storage_path;
  if (!path || !row || row.deleted_at) return;
  const { data, error } = await client.storage.from(BUCKET).download(path);
  if (error) throw error;
  const dest = localPhotoPath(row.log_id, photoUuid);
  const dir = new Directory(`${documentDirectory}workout-photos/${row.log_id}`);
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dest);
  const buf = await data.arrayBuffer();
  // SDK 58 makes File.write async; await so the row below never points at
  // a file whose bytes have not landed.
  await file.write(new Uint8Array(buf));
  // Local-only column (never synced), but still one declared write so the
  // photo grids and storage readout invalidate.
  await mutate(['workout_photos'], async (tx) => {
    await tx.runAsync('UPDATE workout_photos SET uri = ? WHERE uuid = ?', dest, photoUuid);
  });
}

/**
 * Remove the cloud blob. The job's path may be null when the photo was
 * deleted before its first upload finished, so fall back to the row's
 * current path (an in-flight upload records it there).
 */
async function deleteCloudPhoto(
  client: SupabaseClient,
  photoUuid: string,
  storagePath: string | null,
): Promise<void> {
  let path = storagePath;
  if (!path) {
    const db = await openDatabase();
    const row = await db.getFirstAsync<{ storage_path: string | null }>(
      'SELECT storage_path FROM workout_photos WHERE uuid = ?',
      photoUuid,
    );
    path = row?.storage_path ?? null;
  }
  if (!path) return;
  const { error } = await client.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export function localPhotoPath(logId: number, photoUuid: string): string {
  return `${documentDirectory}workout-photos/${logId}/${photoUuid}.jpg`;
}
