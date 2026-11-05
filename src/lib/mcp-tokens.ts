import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';
import type { GetToken } from '@/sync/supabase-auth';

/**
 * Personal tokens for the Incline MCP server (supabase/functions/incline-mcp).
 * The app manages them with the user's Clerk session; an AI app (Claude Code,
 * Claude Desktop, Cursor…) then uses one as a Bearer token. A token is shown
 * once, at creation; the server keeps only its hash.
 */
export interface McpToken {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
}

export type McpTokenError = 'offline' | 'signed_out' | 'too_many' | 'failed';

export function mcpServerUrl(): string | null {
  if (!SUPABASE_URL || SUPABASE_URL === 'your_supabase_url') return null;
  return `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/incline-mcp`;
}

/** The one-line setup for Claude Code; other clients take the URL + header. */
export function claudeCodeCommand(token: string): string {
  return `claude mcp add --transport http incline ${mcpServerUrl()} --header "Authorization: Bearer ${token}"`;
}

async function call<T>(getToken: GetToken, path: string, init: RequestInit = {}): Promise<{ ok: true; data: T } | { ok: false; error: McpTokenError }> {
  const base = mcpServerUrl();
  if (!base || !SUPABASE_ANON_KEY) return { ok: false, error: 'failed' };
  let jwt: string | null = null;
  try {
    jwt = await getToken({ template: 'supabase' });
  } catch {
    jwt = null;
  }
  if (!jwt) return { ok: false, error: 'signed_out' };
  let res: Response;
  try {
    res = await fetch(`${base}/tokens${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    });
  } catch {
    return { ok: false, error: 'offline' };
  }
  if (res.status === 409) return { ok: false, error: 'too_many' };
  if (res.status === 401) return { ok: false, error: 'signed_out' };
  if (!res.ok) return { ok: false, error: 'failed' };
  return { ok: true, data: (await res.json()) as T };
}

export async function listMcpTokens(getToken: GetToken): Promise<McpToken[]> {
  const res = await call<{ tokens: McpToken[] }>(getToken, '');
  if (!res.ok) throw new Error(res.error);
  return res.data.tokens;
}

export async function createMcpToken(getToken: GetToken, label: string) {
  const res = await call<{ id: string; token: string; label: string }>(getToken, '', {
    method: 'POST',
    body: JSON.stringify({ label }),
  });
  return res.ok ? ({ ok: true, token: res.data.token, label: res.data.label } as const) : res;
}

export async function revokeMcpToken(getToken: GetToken, id: string): Promise<boolean> {
  return (await call(getToken, `/${id}`, { method: 'DELETE' })).ok;
}

export function mcpErrorCopy(error: McpTokenError): string {
  switch (error) {
    case 'offline':
      return 'You are offline. Try again when connected.';
    case 'signed_out':
      return 'Sign in to connect AI apps.';
    case 'too_many':
      return 'You have 5 connections. Remove one first.';
    default:
      return 'Could not create a connection. Try again.';
  }
}
