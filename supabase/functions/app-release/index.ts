import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Always-latest share link + release feed (docs/decisions/RELEASES.md).
 *
 *   GET  /app-release                 302 → newest Android build's install page
 *   GET  /app-release?format=json     { latest, recent[] } for "What's new"
 *   POST /app-release                 EAS build webhook (HMAC-SHA1, expo-signature)
 *   POST { kind: 'mirror', id, url }  release-mirror workflow (same HMAC)
 *
 * EAS internal-distribution artifacts expire (~14 days), so the redirect
 * prefers the permanent GitHub Release copy, then the EAS page while it is
 * still live, then the releases page.
 *
 * The share link never names a build, so a new build is live the moment EAS
 * finishes it. Only shareable profiles count (never emulator/development).
 */
const SHARE_PROFILES = new Set(['alpha', 'beta', 'preview', 'production']);
const FALLBACK_URL = Deno.env.get('APP_RELEASE_FALLBACK_URL') ?? 'https://github.com/chrisdco/incline/releases/latest';
const MIRROR_PREFIX = 'https://github.com/chrisdco/incline/releases/';
const MAX_BODY = 64 * 1024;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const db = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

async function signatureOk(body: string, header: string | null): Promise<boolean> {
  const secret = Deno.env.get('EAS_WEBHOOK_SECRET');
  if (!secret || !header) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['verify']);
  const hex = header.replace(/^sha1=/, '');
  if (!/^[0-9a-f]{40}$/i.test(hex)) return false;
  const sig = new Uint8Array(hex.match(/../g)!.map((p) => parseInt(p, 16)));
  return crypto.subtle.verify('HMAC', key, sig, enc.encode(body));
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v ? v.slice(0, max) : null);
const expoUrl = (v: unknown): string | null => (typeof v === 'string' && v.startsWith('https://expo.dev/') ? v : null);

async function onWebhook(req: Request): Promise<Response> {
  const body = await req.text();
  if (body.length > MAX_BODY) return new Response('too large', { status: 413 });
  if (!(await signatureOk(body, req.headers.get('expo-signature')))) return new Response('bad signature', { status: 401 });
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(body);
  } catch {
    return new Response('bad json', { status: 400 });
  }
  if (p.kind === 'mirror') {
    const url = typeof p.url === 'string' && p.url.startsWith(MIRROR_PREFIX) ? p.url.slice(0, 300) : null;
    if (!url || typeof p.id !== 'string') return new Response('bad mirror', { status: 400 });
    const { error } = await db().from('app_releases').update({ mirror_url: url }).eq('id', p.id);
    if (error) return new Response('store failed', { status: 500 });
    return new Response('ok');
  }
  const m = (p.metadata ?? {}) as Record<string, unknown>;
  const artifacts = (p.artifacts ?? {}) as Record<string, unknown>;
  const profile = str(m.buildProfile, 40);
  // Acknowledge everything else (2xx) so EAS does not retry it.
  if (p.status !== 'finished' || !profile || !SHARE_PROFILES.has(profile)) return new Response('ignored');
  const page = expoUrl(p.buildDetailsPageUrl);
  const platform = p.platform === 'ios' ? 'ios' : p.platform === 'android' ? 'android' : null;
  if (!page || !platform || typeof p.id !== 'string') return new Response('ignored');
  const commit = str(m.gitCommitMessage, 500)?.split('\n')[0] ?? '';
  const { error } = await db()
    .from('app_releases')
    .upsert({
      id: p.id,
      platform,
      profile,
      channel: str(m.channel, 40),
      app_version: str(m.appVersion, 40) ?? '0',
      build_version: str(m.appBuildVersion, 40),
      runtime_version: str(m.runtimeVersion, 80),
      git_commit: str(m.gitCommitHash, 64),
      title: (str(m.message, 200) ?? commit).slice(0, 200),
      page_url: page,
      artifact_url: expoUrl(artifacts.buildUrl),
      artifact_expires_at: str(p.expirationDate, 40),
      completed_at: str(p.completedAt, 40) ?? new Date().toISOString(),
    }, { onConflict: 'id', ignoreDuplicates: false });
  if (error) {
    console.error('app-release upsert failed', error.message);
    return new Response('store failed', { status: 500 }); // EAS retries
  }
  return new Response('ok');
}

async function onRead(url: URL): Promise<Response> {
  const platform = url.searchParams.get('platform') === 'ios' ? 'ios' : 'android';
  const profile = url.searchParams.get('profile');
  let q = db()
    .from('app_releases')
    .select('id, profile, channel, app_version, build_version, runtime_version, title, notes, page_url, mirror_url, artifact_expires_at, completed_at')
    .eq('platform', platform)
    .eq('hidden', false)
    .order('completed_at', { ascending: false })
    .limit(5);
  if (profile && SHARE_PROFILES.has(profile)) q = q.eq('profile', profile);
  const { data, error } = await q;
  if (error) console.error('app-release read failed', error.message);
  const rows = data ?? [];
  const now = Date.now();
  const live = (r: (typeof rows)[number]) =>
    r.mirror_url ?? (r.artifact_expires_at && Date.parse(r.artifact_expires_at) > now ? r.page_url : null);
  const target = rows.map(live).find(Boolean) ?? FALLBACK_URL;
  if (url.searchParams.get('format') === 'json') {
    return Response.json(
      { latest: rows[0] ?? null, recent: rows, install_url: target },
      { headers: { ...cors, 'Cache-Control': 'public, max-age=300' } },
    );
  }
  return new Response(null, {
    status: 302,
    headers: { ...cors, Location: target, 'Cache-Control': 'public, max-age=300' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method === 'POST') return onWebhook(req);
  if (req.method === 'GET' || req.method === 'HEAD') return onRead(new URL(req.url));
  return new Response('method not allowed', { status: 405 });
});
