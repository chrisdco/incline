/**
 * Authenticated Supabase client for user-data sync.
 *
 * Catalog reads continue to use the anon client in `supabase.ts`.
 * Sync mutations attach the Clerk session JWT so RLS (`auth.jwt()->>'sub'`)
 * matches `schema_meta.owner_user_id`.
 *
 * Setup (dashboard):
 * 1. Clerk → JWT templates → create "supabase" with `aud: "authenticated"`.
 * 2. Supabase → Authentication → Third-party / JWT → add Clerk JWKS URL.
 * 3. Or use Clerk's native Supabase integration.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

export type GetToken = (options?: { template?: string }) => Promise<string | null>;

let _authed: SupabaseClient | null = null;
let _token: string | null = null;

export function syncBackendReady(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL !== 'your_supabase_url');
}

/**
 * Returns a Supabase client whose Authorization header uses the Clerk JWT.
 * Prefer template name `supabase` when configured; falls back to the default session token.
 */
export async function getAuthedSupabase(getToken: GetToken): Promise<SupabaseClient | null> {
  if (!syncBackendReady()) return null;

  let token: string | null = null;
  try {
    token = await getToken({ template: 'supabase' });
  } catch {
    token = null;
  }
  if (!token) {
    try {
      token = await getToken();
    } catch {
      return null;
    }
  }
  if (!token) return null;

  if (_authed && _token === token) return _authed;

  _token = token;
  _authed = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return _authed;
}

export type TokenCheck = { ok: true } | { ok: false; reason: string };

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Local pre-flight on the sync JWT (#201). The bare `getToken()` fallback
 * yields a Clerk session token Supabase rejects (wrong audience, no role), so
 * every run used to fail RLS and burn outbox attempts — looking like a bad
 * network forever. Accept `aud` containing "authenticated" (JWT template) or
 * `role: "authenticated"` (Clerk native Supabase integration).
 */
export function inspectSyncToken(token: string, userId: string, nowMs = Date.now()): TokenCheck {
  const claims = decodeJwtPayload(token);
  if (!claims) return { ok: false, reason: 'Sync token is not a JWT' };
  const aud = claims.aud;
  const audOk = Array.isArray(aud) ? aud.includes('authenticated') : aud === 'authenticated';
  if (!audOk && claims.role !== 'authenticated') {
    return {
      ok: false,
      reason: 'Sync sign-in misconfigured: token is not for Supabase (check the Clerk "supabase" JWT template)',
    };
  }
  if (typeof claims.exp === 'number' && claims.exp * 1000 <= nowMs) {
    return { ok: false, reason: 'Sync token expired — sign in again' };
  }
  if (claims.sub !== userId) {
    return { ok: false, reason: 'Sync token belongs to a different account' };
  }
  return { ok: true };
}

export type SyncClientResult =
  | { ok: true; client: SupabaseClient }
  | { ok: false; reason: string };

/** Authed client for runSync, refusing tokens that would only fail RLS. */
export async function getSyncClient(getToken: GetToken, userId: string): Promise<SyncClientResult> {
  const client = await getAuthedSupabase(getToken);
  if (!client || !_token) return { ok: false, reason: 'Not authenticated for sync' };
  const check = inspectSyncToken(_token, userId);
  if (!check.ok) return check;
  return { ok: true, client };
}

export function clearAuthedSupabase(): void {
  _authed = null;
  _token = null;
}
