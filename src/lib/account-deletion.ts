import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';
import type { GetToken } from '@/sync/supabase-auth';

export interface DeletionStatus {
  requested_at: string;
  purge_at: string;
}

export type DeletionCheck =
  | { ok: true; scheduled: DeletionStatus | null }
  | { ok: false };

async function supabaseToken(getToken: GetToken): Promise<string | null> {
  // Supabase-template JWT only — never the default token. A default-audience
  // token fails RLS and must not be mistaken for an answer.
  try {
    return await getToken({ template: 'supabase' });
  } catch {
    return null;
  }
}

function restBase(): { base: string; anon: string } | null {
  const url = SUPABASE_URL;
  const anon = SUPABASE_ANON_KEY;
  if (!url || !anon || url === 'your_supabase_url') return null;
  return { base: `${url.replace(/\/$/, '')}/rest/v1/account_deletions`, anon };
}

/**
 * Scheduled-deletion flag with explicit unknowns. `ok: false` covers offline
 * and misconfigured backends — callers must NOT treat it as "clear and sync".
 */
export async function getDeletionStatus(
  userId: string,
  getToken: GetToken,
): Promise<DeletionCheck> {
  const rest = restBase();
  if (!rest) return { ok: true, scheduled: null };
  const token = await supabaseToken(getToken);
  if (!token) return { ok: false };
  try {
    const res = await fetch(
      `${rest.base}?user_id=eq.${encodeURIComponent(userId)}&select=requested_at,purge_at`,
      { headers: { apikey: rest.anon, Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return { ok: false };
    const rows = (await res.json()) as DeletionStatus[];
    return { ok: true, scheduled: rows[0] ?? null };
  } catch {
    return { ok: false };
  }
}

/** Schedule deletion (30-day window enforced by DB CHECK). Throws on failure. */
export async function requestDeletion(userId: string, getToken: GetToken): Promise<DeletionStatus> {
  const rest = restBase();
  if (!rest) throw new Error('Sync backend is not configured');
  const token = await supabaseToken(getToken);
  if (!token) throw new Error('Could not authenticate deletion request');
  const res = await fetch(`${rest.base}?select=requested_at,purge_at`, {
    method: 'POST',
    headers: { apikey: rest.anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: userId }),
  });
  if (!res.ok) throw new Error('Could not schedule deletion');
  const rows = (await res.json()) as DeletionStatus[];
  if (!rows[0]) throw new Error('Could not schedule deletion');
  return rows[0];
}

/** Cancel a scheduled deletion. Cloud rows were never tombstoned. Throws on failure. */
export async function cancelDeletion(userId: string, getToken: GetToken): Promise<void> {
  const rest = restBase();
  if (!rest) throw new Error('Sync backend is not configured');
  const token = await supabaseToken(getToken);
  if (!token) throw new Error('Could not authenticate');
  const res = await fetch(`${rest.base}?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { apikey: rest.anon, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Could not cancel deletion');
}
