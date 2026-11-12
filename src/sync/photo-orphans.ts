import { deleteAsync, documentDirectory, getInfoAsync, readDirectoryAsync } from 'expo-file-system/legacy';

import { openDatabase } from '@/db/client';

/**
 * Files younger than this are never swept: addWorkoutPhotos copies the file
 * before its row commits, and a download writes before it records the uri.
 */
export const ORPHAN_GRACE_MS = 60 * 60 * 1000;

export interface PhotoFileInfo {
  uri: string;
  modifiedMs: number;
}

/**
 * Pure: files under workout-photos/ that no live photo row points at and
 * that are past the grace window. Tombstoned rows count as not live — their
 * file is meant to be gone already (#147).
 */
export function findOrphanPhotoFiles(
  files: readonly PhotoFileInfo[],
  liveUris: ReadonlySet<string>,
  nowMs: number,
  graceMs = ORPHAN_GRACE_MS,
): string[] {
  return files
    .filter((f) => !liveUris.has(f.uri) && nowMs - f.modifiedMs >= graceMs)
    .map((f) => f.uri);
}

/**
 * Remove photo files left behind by a crash between file and row writes, a
 * delete whose file removal failed, or an old wipe. One query for live uris,
 * then a directory walk (workout-photos/<logId>/<uuid>.jpg).
 */
export async function cleanupOrphanPhotoFiles(nowMs = Date.now()): Promise<number> {
  if (!documentDirectory) return 0;
  const root = `${documentDirectory}workout-photos/`;
  const rootInfo = await getInfoAsync(root);
  if (!rootInfo.exists) return 0;

  const db = await openDatabase();
  const rows = await db.getAllAsync<{ uri: string }>(
    'SELECT uri FROM workout_photos WHERE deleted_at IS NULL',
  );
  const live = new Set(rows.map((r) => r.uri));

  const files: PhotoFileInfo[] = [];
  for (const dir of await readDirectoryAsync(root)) {
    const dirUri = `${root}${dir}/`;
    const dirInfo = await getInfoAsync(dirUri);
    if (!dirInfo.exists || !dirInfo.isDirectory) continue;
    for (const name of await readDirectoryAsync(dirUri)) {
      const uri = `${dirUri}${name}`;
      const info = await getInfoAsync(uri);
      if (!info.exists || info.isDirectory) continue;
      // Legacy API reports seconds.
      files.push({ uri, modifiedMs: (info.modificationTime ?? 0) * 1000 });
    }
  }

  const orphans = findOrphanPhotoFiles(files, live, nowMs);
  for (const uri of orphans) {
    await deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
  return orphans.length;
}
