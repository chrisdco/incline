import { openDatabase } from './client';
import { resetUserData } from './queries/profile';
import { useActiveWorkout } from '@/store/active-workout-store';

const OWNER_KEY = 'owner_user_id';

/**
 * Account ↔ local data binding.
 *
 * Local SQLite is single-device and historically had no Clerk user id on rows.
 * We store the owning Clerk user id in `schema_meta`. On first bind, claim the
 * DB. If a different account signs in, wipe user-owned data (logs, profile,
 * bodyweight, custom exercises, custom templates, sync outbox) so accounts do
 * not share history. The exercise catalog and bundled templates are kept.
 *
 * Cloud sync keys rows by this same owner id (Clerk JWT `sub`).
 */
export async function bindLocalAccount(clerkUserId: string): Promise<{ switched: boolean }> {
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
    return { switched: false };
  }

  if (current === clerkUserId) {
    return { switched: false };
  }

  await resetUserData();
  useActiveWorkout.getState().clear();
  try {
    const { resetAccountPreferences } = await import('@/store/settings-store');
    resetAccountPreferences();
  } catch {
    // settings optional at bind time
  }
  await db.runAsync(
    'INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    OWNER_KEY,
    clerkUserId,
  );
  try {
    const { clearAuthedSupabase } = await import('@/sync/supabase-auth');
    clearAuthedSupabase();
  } catch {
    // sync module optional at bind time
  }
  return { switched: true };
}

export async function getLocalAccountOwner(): Promise<string | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM schema_meta WHERE key = ?',
    OWNER_KEY,
  );
  return row?.value ?? null;
}
