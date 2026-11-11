import { openDatabase } from './client';
import { OWNER_KEY, resetUserData } from './reset';

/**
 * Account ↔ local data binding.
 *
 * Local SQLite is single-device and historically had no Clerk user id on rows.
 * We store the owning Clerk user id in `schema_meta`. On first bind, claim the
 * DB. If a different account signs in, wipe user-owned data (logs, profile,
 * bodyweight, custom exercises, custom templates, sync outbox) so accounts do
 * not share history. The exercise catalog and bundled templates are kept.
 * Explicit sign-out wipes too and releases the claim (`signOutLocalAccount`).
 *
 * Cloud sync keys rows by this same owner id (Clerk JWT `sub`).
 */
export async function bindLocalAccount(clerkUserId: string): Promise<{ switched: boolean }> {
  const prepared = await prepareAccountSwitch(clerkUserId);
  if (!prepared.switched) return { switched: false };
  await completeAccountSwitch(clerkUserId);
  return { switched: true };
}

/**
 * Local changes a wipe would destroy: outbox rows plus photo uploads and
 * cloud deletes still queued (downloads are re-derivable from the cloud, so
 * they don't count). Sign-out and account switch ask before losing these.
 */
export async function pendingLocalChanges(): Promise<number> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ outbox: number; blobs: number }>(
    `SELECT (SELECT COUNT(*) FROM sync_outbox) AS outbox,
            (SELECT COUNT(*) FROM photo_blob_queue WHERE op <> 'download') AS blobs`,
  );
  return (row?.outbox ?? 0) + (row?.blobs ?? 0);
}

/**
 * Phase 1 (no wipe): does this login switch accounts, and how many changes
 * from the previous owner never uploaded? The gate uses `pending` to ask
 * before phase 2 destroys them — a switch with pending uploads is otherwise
 * silent permanent data loss.
 */
export async function prepareAccountSwitch(
  clerkUserId: string,
): Promise<{ switched: boolean; pending: number }> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM schema_meta WHERE key = ?',
    OWNER_KEY,
  );
  const current = row?.value ?? null;
  if (!current) {
    await db.runAsync(
      'INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      OWNER_KEY,
      clerkUserId,
    );
    return { switched: false, pending: 0 };
  }
  if (current === clerkUserId) {
    return { switched: false, pending: 0 };
  }
  let pending = 0;
  try {
    pending = await pendingLocalChanges();
  } catch {
    // Unreadable — proceed; the wipe path reports failures itself.
  }
  return { switched: true, pending };
}

/** Phase 2: wipe previous-owner data and claim the DB. Only call after the gate clears it. */
export async function completeAccountSwitch(clerkUserId: string): Promise<void> {
  // New account starts clean, device setup included.
  await resetUserData({ owner: clerkUserId, keepDeviceSettings: false });
}

/**
 * Explicit sign-out (#145): wipe this account's local data and release the
 * claim, so history, bodyweight and photos don't sit on a shared or lost
 * device. Device-only settings (haptics, reminders) stay. Call before the
 * Clerk sign-out; the caller has already confirmed any pending changes.
 */
export async function signOutLocalAccount(): Promise<void> {
  await resetUserData({ owner: null, keepDeviceSettings: true });
}

export async function getLocalAccountOwner(): Promise<string | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM schema_meta WHERE key = ?',
    OWNER_KEY,
  );
  return row?.value ?? null;
}
