import * as Crypto from 'expo-crypto';
import { File, Directory } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { documentDirectory } from 'expo-file-system/legacy';
import type { SupabaseClient } from '@supabase/supabase-js';

import { openDatabase } from '@/db/client';
import { getLocalAccountOwner } from '@/db/account';
import { getAuthedSupabase, type GetToken } from './supabase-auth';
import { enqueueSync } from './outbox';

const BUCKET = 'workout-photos';
const MAX_ATTEMPTS = 8;
const CONCURRENCY = 2;

export async function enqueuePhotoBlob(
  photoUuid: string,
  op: 'upload' | 'download' | 'delete',
  storagePath?: string | null,
): Promise<void> {
  const db = await openDatabase();
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

export async function drainPhotoBlobs(opts: {
  userId: string;
  getToken: GetToken;
}): Promise<void> {
  const db = await openDatabase();
  const now = Date.now();
  const jobs = await db.getAllAsync<{
    id: number;
    photo_uuid: string;
    op: string;
    storage_path: string | null;
    attempts: number;
  }>(
    `SELECT id, photo_uuid, op, storage_path, attempts FROM photo_blob_queue
     WHERE next_attempt_at <= ? ORDER BY id ASC LIMIT 8`,
    now,
  );
  if (jobs.length === 0) return;

  const client = await getAuthedSupabase(opts.getToken);
  if (!client) return;

  const workers = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async (_, slot) => {
    for (let i = slot; i < jobs.length; i += CONCURRENCY) {
      const job = jobs[i];
      try {
        if (job.op === 'upload') await uploadPhoto(client, opts.userId, job.photo_uuid);
        else if (job.op === 'download') await downloadPhoto(client, job.photo_uuid, job.storage_path);
        else if (job.op === 'delete') await deleteCloudPhoto(client, job.storage_path);
        await db.runAsync('DELETE FROM photo_blob_queue WHERE id = ?', job.id);
      } catch (err) {
        const attempts = job.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          console.warn('[photos] giving up blob job', job.op, job.photo_uuid, err);
          await db.runAsync('DELETE FROM photo_blob_queue WHERE id = ?', job.id);
          continue;
        }
        const delay = Math.min(30 * 60 * 1000, 2000 * 2 ** attempts);
        await db.runAsync(
          'UPDATE photo_blob_queue SET attempts = ?, next_attempt_at = ? WHERE id = ?',
          attempts,
          Date.now() + delay,
          job.id,
        );
      }
    }
  });
  await Promise.all(workers);
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
  await db.runAsync(
    'UPDATE workout_photos SET storage_path = ?, updated_at = ? WHERE uuid = ?',
    path,
    now,
    photoUuid,
  );
  await enqueueSync('workout_photos', photoUuid, row.deleted_at ? 'delete' : 'upsert', {
    workout_log_uuid: row.log_uuid,
    storage_path: path,
    content_type: row.content_type ?? 'image/jpeg',
    byte_size: buf.byteLength,
    checksum: row.checksum,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: now,
    deleted_at: row.deleted_at,
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
  }>(
    `SELECT p.uri, p.storage_path, p.workout_log_id as log_id
     FROM workout_photos p WHERE p.uuid = ?`,
    photoUuid,
  );
  const path = storagePath ?? row?.storage_path;
  if (!path || !row) return;
  const { data, error } = await client.storage.from(BUCKET).download(path);
  if (error) throw error;
  const dest = localPhotoPath(row.log_id, photoUuid);
  const dir = new Directory(`${documentDirectory}workout-photos/${row.log_id}`);
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dest);
  const buf = await data.arrayBuffer();
  file.write(new Uint8Array(buf));
  await db.runAsync('UPDATE workout_photos SET uri = ? WHERE uuid = ?', dest, photoUuid);
}

async function deleteCloudPhoto(client: SupabaseClient, storagePath: string | null): Promise<void> {
  if (!storagePath) return;
  const { error } = await client.storage.from(BUCKET).remove([storagePath]);
  if (error) throw error;
}

export function localPhotoPath(logId: number, photoUuid: string): string {
  return `${documentDirectory}workout-photos/${logId}/${photoUuid}.jpg`;
}
