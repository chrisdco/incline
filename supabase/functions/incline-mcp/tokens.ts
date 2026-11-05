import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Personal access tokens for MCP clients (supabase/mcp.sql). The token is
 * `inc_` + 32 random bytes (base64url); only its SHA-256 is stored.
 */
export const MAX_ACTIVE_TOKENS = 5;

export interface TokenOwner {
  tokenId: string;
  userId: string;
  label: string;
  scopes: string[];
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `inc_${b64}`;
}

export function bearer(req: Request): string | null {
  const auth = req.headers.get('Authorization');
  if (!auth?.toLowerCase().startsWith('bearer ')) return null;
  return auth.slice(7).trim() || null;
}

export function isPat(token: string): boolean {
  return /^inc_[A-Za-z0-9_-]{43}$/.test(token);
}

export async function verifyPat(db: SupabaseClient, token: string): Promise<TokenOwner | null> {
  if (!isPat(token)) return null;
  const { data } = await db
    .from('mcp_tokens')
    .select('id, user_id, label, scopes, last_used_at')
    .eq('token_hash', await sha256Hex(token))
    .is('revoked_at', null)
    .maybeSingle();
  if (!data) return null;
  // At most one write a minute per token: "last used" is for the user, not an audit log.
  const last = data.last_used_at ? Date.parse(data.last_used_at) : 0;
  if (Date.now() - last > 60_000) {
    void db.from('mcp_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  }
  return { tokenId: data.id, userId: data.user_id, label: data.label, scopes: data.scopes ?? [] };
}

export async function mintToken(
  db: SupabaseClient,
  userId: string,
  label: string,
): Promise<{ ok: true; id: string; token: string; label: string } | { ok: false; error: string }> {
  const { count } = await db
    .from('mcp_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('revoked_at', null);
  if ((count ?? 0) >= MAX_ACTIVE_TOKENS) return { ok: false, error: 'too_many_tokens' };
  const token = newToken();
  const { data, error } = await db
    .from('mcp_tokens')
    .insert({ user_id: userId, token_hash: await sha256Hex(token), label })
    .select('id, label')
    .single();
  if (error || !data) return { ok: false, error: 'insert_failed' };
  return { ok: true, id: data.id, token, label: data.label };
}

export async function listTokens(db: SupabaseClient, userId: string) {
  const { data } = await db
    .from('mcp_tokens')
    .select('id, label, created_at, last_used_at')
    .eq('user_id', userId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function revokeToken(db: SupabaseClient, userId: string, id: string): Promise<boolean> {
  const { data } = await db
    .from('mcp_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .select('id');
  return (data?.length ?? 0) > 0;
}
