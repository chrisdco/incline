import * as jose from 'npm:jose@5';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  INTEGRITY_NONCE_HEADER,
  INTEGRITY_TOKEN_HEADER,
  integrityProblem,
  type IntegrityGrade,
  type IntegrityPayload,
} from '../contracts/ai/integrity.ts';

/**
 * Grades a request's Play Integrity token (FOUNDATION-REVIEW G2; policy and
 * thresholds in contracts/ai/integrity.ts).
 *
 * Config (Supabase function secrets):
 *   PLAY_INTEGRITY_SERVICE_ACCOUNT  service-account JSON with access to the
 *                                   Play Integrity API. Unset = checking off.
 *   PLAY_INTEGRITY_PACKAGE          defaults to com.chrisdc777.incline
 *   PLAY_INTEGRITY_CERT_SHA256      comma list of signing-cert digests that
 *                                   count as ours while sideloaded
 *
 * Nonces are single use (ai_integrity_nonces, service-only), so a captured
 * token can't be replayed. Google or token-endpoint failures grade 'off'.
 */

const DEFAULT_PACKAGE = 'com.chrisdc777.incline';
const SCOPE = 'https://www.googleapis.com/auth/playintegrity';
const TIMEOUT_MS = 4000;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function serviceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('PLAY_INTEGRITY_SERVICE_ACCOUNT')?.trim();
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    return sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

let access: { token: string; until: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string | null> {
  if (access && access.until > Date.now()) return access.token;
  const aud = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const key = await jose.importPKCS8(sa.private_key, 'RS256');
  const assertion = await new jose.SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
  const res = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) return null;
  access = { token: body.access_token, until: Date.now() + ((body.expires_in ?? 3600) - 120) * 1000 };
  return access.token;
}

/** Decoded payload, 'invalid' when Google rejects the token, null when we couldn't ask. */
async function decode(sa: ServiceAccount, pkg: string, token: string): Promise<IntegrityPayload | 'invalid' | null> {
  const bearer = await accessToken(sa);
  if (!bearer) return null;
  const res = await fetch(`https://playintegrity.googleapis.com/v1/${encodeURIComponent(pkg)}:decodeIntegrityToken`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ integrity_token: token }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 400) return 'invalid';
  if (!res.ok) return null;
  const body = (await res.json()) as { tokenPayloadExternal?: IntegrityPayload };
  return body.tokenPayloadExternal ?? 'invalid';
}

export async function gradeIntegrity(req: Request, db: SupabaseClient): Promise<IntegrityGrade> {
  const sa = serviceAccount();
  if (!sa) return 'off';
  const token = req.headers.get(INTEGRITY_TOKEN_HEADER)?.trim();
  const nonce = req.headers.get(INTEGRITY_NONCE_HEADER)?.trim();
  if (!token || !nonce || nonce.length > 128) return 'unverified';

  const pkg = Deno.env.get('PLAY_INTEGRITY_PACKAGE')?.trim() || DEFAULT_PACKAGE;
  const certDigests = (Deno.env.get('PLAY_INTEGRITY_CERT_SHA256') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  let payload: IntegrityPayload | 'invalid' | null;
  try {
    payload = await decode(sa, pkg, token);
  } catch {
    payload = null;
  }
  if (payload === null) return 'off';
  if (payload === 'invalid') return 'unverified';

  const problem = integrityProblem(payload, { packageName: pkg, nonce, now: Date.now(), certDigests });
  if (problem) {
    console.warn(`integrity: ${problem}`);
    return 'unverified';
  }

  // Single use: a replayed nonce conflicts on the primary key.
  const { error } = await db.from('ai_integrity_nonces').insert({ nonce });
  if (error) return error.code === '23505' ? 'unverified' : 'off';
  if (Math.random() < 0.01) {
    await db.from('ai_integrity_nonces').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString());
  }
  return 'verified';
}
