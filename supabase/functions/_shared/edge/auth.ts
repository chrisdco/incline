import * as jose from 'npm:jose@5';

/**
 * Clerk is a third-party JWT for Supabase (template `supabase`). Functions run
 * with `verify_jwt = false` and check the bearer here, so `sub` is trusted even
 * when the gateway can't map the token. Keys come from, in order:
 *   CLERK_JWKS_URL → CLERK_FRONTEND_API (/.well-known/jwks.json) → SUPABASE_JWKS.
 * SUPABASE_JWKS is set by the platform and may be a URL or an inline JWKS JSON
 * document; both work. Any failure means "not signed in", never a 500.
 */
type KeySet = ReturnType<typeof jose.createRemoteJWKSet> | ReturnType<typeof jose.createLocalJWKSet>;

function keySource(): string | null {
  const direct = Deno.env.get('CLERK_JWKS_URL')?.trim();
  if (direct) return direct;
  const frontend = Deno.env.get('CLERK_FRONTEND_API')?.trim();
  if (frontend) {
    const host = frontend.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${host}/.well-known/jwks.json`;
  }
  return Deno.env.get('SUPABASE_JWKS')?.trim() || null;
}

let keys: KeySet | null = null;
let keysFor: string | null = null;

function keySet(): KeySet | null {
  const source = keySource();
  if (!source) return null;
  if (keys && keysFor === source) return keys;
  try {
    keys = source.startsWith('{')
      ? jose.createLocalJWKSet(JSON.parse(source) as jose.JSONWebKeySet)
      : jose.createRemoteJWKSet(new URL(source));
    keysFor = source;
    return keys;
  } catch {
    return null;
  }
}

/** Verified Clerk user id from `Authorization: Bearer …`, or null. */
export async function verifyBearerSub(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  const set = token ? keySet() : null;
  if (!set) return null;
  const audience = Deno.env.get('AI_JWT_AUD') ?? 'authenticated';
  for (const opts of [{ audience }, {}]) {
    try {
      const { payload } = await jose.jwtVerify(token, set, opts);
      if (typeof payload.sub === 'string' && payload.sub) return payload.sub;
    } catch {
      // try the next option
    }
  }
  return null;
}
