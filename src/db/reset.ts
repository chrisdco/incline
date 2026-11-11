import { queryClient } from '@/lib/query-client';
import { useActiveWorkout } from '@/store/active-workout-store';

import { RESET_TABLES, wipeUserTables } from './queries/profile';
import { mutate } from './write';

/** schema_meta key holding the Clerk user id that owns this local DB. */
export const OWNER_KEY = 'owner_user_id';

export interface ResetOptions {
  /**
   * Who owns the DB afterwards. A string claims it for that account (switch),
   * `null` releases it (sign-out: the next login is a fresh claim, not a
   * switch), `undefined` leaves the current owner (recovery, dev tools,
   * account deletion — the user stays signed in or is about to sign out).
   */
  owner?: string | null;
  /**
   * Keep device-only settings (haptics, rest alerts, reminders, media taste).
   * Sign-out keeps them: they belong to the phone, not the account. An
   * account switch resets them so the new account starts clean.
   */
  keepDeviceSettings?: boolean;
}

/**
 * THE local reset (#146). Sign-out, account switch, account deletion, the
 * error-boundary recovery and dev tools all call this — never a partial copy.
 *
 * 1. Drop every cached query (ids restart after a wipe, so a stale entry
 *    could resurrect another account's session).
 * 2. One mutate(): every user table, account-scoped kv (incl. the prefs LWW
 *    stamp and active program), outbox, sync cursors, and the owner change.
 *    A failure rolls all of it back and rethrows.
 * 3. After commit: photo files, then in-memory state (active workout, own
 *    AI key, account preferences, authed Supabase client).
 */
export async function resetUserData(options: ResetOptions = {}): Promise<void> {
  const { owner, keepDeviceSettings = true } = options;
  queryClient.clear();
  await mutate(RESET_TABLES, async (tx) => {
    await wipeUserTables(tx);
    if (owner === null) {
      await tx.runAsync('DELETE FROM schema_meta WHERE key = ?', OWNER_KEY);
    } else if (owner !== undefined) {
      await tx.runAsync(
        'INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        OWNER_KEY,
        owner,
      );
    }
  });
  await deletePhotoFiles();
  await resetInMemoryAccountState(keepDeviceSettings);
}

async function deletePhotoFiles(): Promise<void> {
  try {
    const { deleteAsync, documentDirectory } = await import('expo-file-system/legacy');
    if (documentDirectory) {
      await deleteAsync(`${documentDirectory}workout-photos`, { idempotent: true });
    }
  } catch {
    // No photo dir (or no file system in this runtime): nothing to remove.
  }
}

/**
 * Memory is disposable, but it must not outlive the rows it mirrored. Each
 * step is isolated so one unavailable native module can't skip the rest.
 */
async function resetInMemoryAccountState(keepDeviceSettings: boolean): Promise<void> {
  useActiveWorkout.getState().clear();
  try {
    const { resetAiSettings } = await import('@/ai/byok');
    await resetAiSettings();
  } catch {
    // Keystore unavailable — the kv half was already wiped with the data.
  }
  try {
    const { resetAccountPreferences } = await import('@/store/settings-store');
    resetAccountPreferences({ keepDeviceSettings });
  } catch {
    // Settings store unavailable at this point in boot.
  }
  try {
    const { clearAuthedSupabase } = await import('@/sync/supabase-auth');
    clearAuthedSupabase();
  } catch {
    // Sync module optional.
  }
}
