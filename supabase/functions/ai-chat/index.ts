import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { AI_CONSENT_HEADER, AI_CONSENT_VERSION } from '../_shared/contracts/ai/consent.ts';
import { aiTaskFlag, isFlagDisabled } from '../_shared/contracts/ai/flags.ts';
import { verifyBearerSub } from '../_shared/edge/auth.ts';
import { upstreams } from '../_shared/edge/upstream.ts';
import { MAX_BODY_BYTES, parseChatRequest, pickChatUpstreams, withPreamble, type CatalogRow } from './request.ts';

/**
 * Ask chat gateway (AI-CHAT §3.3). POST an OpenAI-style
 *   { messages, tools?, max_tokens? }
 * and get the upstream's SSE stream back unchanged. It never runs tools: the
 * loop runs on the device against local SQLite.
 *
 * Per request: Clerk auth → consent header (5.1.2(i)) → kill switch
 * `task:chat` → bounded body → per-user daily step quota → model catalog (G8,
 * falls back to env slots) → first upstream that opens a stream. The model
 * actually used is returned in `x-incline-model`. With AI_TASK_STUB=1 or no
 * keys it streams a fixed reply so the path can be smoke-tested for free.
 */
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': `authorization, x-client-info, apikey, content-type, ${AI_CONSENT_HEADER}`,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-incline-model',
};

const DAY_SECONDS = 24 * 60 * 60;
/** Model steps per day (a turn is up to 5 steps): about 30 turns. */
const DAILY_STEPS = 150;
const CACHE_TTL_MS = 60_000;
const CONNECT_TIMEOUT_MS = 20_000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

let admin: SupabaseClient | null = null;
function serviceClient(): SupabaseClient | null {
  if (admin) return admin;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

let flags: { keys: string[]; at: number } | null = null;
async function disabledKeys(db: SupabaseClient): Promise<string[]> {
  if (flags && Date.now() - flags.at < CACHE_TTL_MS) return flags.keys;
  const { data, error } = await db.from('ai_flags').select('key').eq('disabled', true);
  const keys = error ? (flags?.keys ?? []) : (data ?? []).map((r: { key: string }) => r.key);
  flags = { keys, at: Date.now() };
  return keys;
}

let catalog: { rows: CatalogRow[] | null; at: number } | null = null;
async function catalogRows(db: SupabaseClient): Promise<CatalogRow[] | null> {
  if (catalog && Date.now() - catalog.at < CACHE_TTL_MS) return catalog.rows;
  const { data, error } = await db.from('ai_models').select('id, slot, model, tools, uses, priority, enabled');
  const rows = error ? (catalog?.rows ?? null) : ((data ?? []) as CatalogRow[]);
  catalog = { rows, at: Date.now() };
  return rows;
}

function sseHeaders(model: string): Record<string, string> {
  return {
    ...corsHeaders,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'x-incline-model': model,
  };
}

function stubStream(): Response {
  const enc = new TextEncoder();
  const chunks = [
    { model: 'stub', choices: [{ delta: { content: 'AI is in test mode, so this is a fixed reply. ' } }] },
    { model: 'stub', choices: [{ delta: { content: 'Your data reached the gateway.' }, finish_reason: 'stop' }] },
    { model: 'stub', choices: [], usage: { prompt_tokens: 0, completion_tokens: 0 } },
  ];
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(`data: ${JSON.stringify(ch)}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: sseHeaders('stub') });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const userId = await verifyBearerSub(req);
  if (!userId) return json(401, { ok: false, error: 'unauthorized' });

  // New endpoint, no legacy clients: consent is required, not just audited.
  const consent = Number(req.headers.get(AI_CONSENT_HEADER));
  if (!Number.isFinite(consent) || consent < AI_CONSENT_VERSION) return json(412, { ok: false, error: 'consent_required' });

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'too_large' });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }
  const parsed = parseChatRequest(raw);
  if (!parsed.ok) return json(400, { ok: false, error: parsed.error });

  const db = serviceClient();
  if (!db) return json(500, { ok: false, error: 'server_misconfigured' });
  if (isFlagDisabled(await disabledKeys(db), aiTaskFlag('chat'))) return json(503, { ok: false, error: 'disabled' });

  const { data: tier } = await db.from('ai_user_tiers').select('multiplier').eq('user_id', userId).maybeSingle();
  const multiplier = Math.max(1, Math.min(100, Number(tier?.multiplier) || 1));
  const { data: allowed, error: rateError } = await db.rpc('ai_task_consume', {
    p_user: userId,
    p_task: 'chat',
    p_limit: DAILY_STEPS * multiplier,
    p_window_seconds: DAY_SECONDS,
  });
  if (rateError) return json(500, { ok: false, error: 'quota_unavailable' });
  if (allowed !== true) return json(429, { ok: false, error: 'rate_limited' });

  const slots = upstreams();
  if (Deno.env.get('AI_TASK_STUB') === '1' || slots.length === 0) return stubStream();

  const candidates = pickChatUpstreams(await catalogRows(db), slots);
  const messages = withPreamble(parsed.value.messages);
  const aig = Deno.env.get('CF_AIG_TOKEN')?.trim();
  let rateLimited = false;

  for (const up of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    // A client that hangs up stops the upstream too.
    req.signal.addEventListener('abort', () => controller.abort());
    try {
      const res = await fetch(`${up.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${up.apiKey}`,
          'Content-Type': 'application/json',
          ...(aig ? { 'cf-aig-authorization': `Bearer ${aig}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: up.model,
          messages,
          ...(parsed.value.tools.length ? { tools: parsed.value.tools, tool_choice: 'auto' } : {}),
          max_tokens: parsed.value.maxTokens,
          temperature: 0.3,
          stream: true,
          stream_options: { include_usage: true },
          ...(up.reasoningEffort ? { reasoning_effort: up.reasoningEffort } : {}),
        }),
      });
      clearTimeout(timer);
      if (res.ok && res.body) return new Response(res.body, { status: 200, headers: sseHeaders(up.model) });
      if (res.status === 429) rateLimited = true;
      await res.body?.cancel();
    } catch {
      clearTimeout(timer);
      if (req.signal.aborted) break;
    }
  }

  // Nothing streamed: give the step back so an outage doesn't eat the day's quota.
  await db.rpc('ai_task_refund', { p_user: userId, p_task: 'chat' });
  return rateLimited ? json(429, { ok: false, error: 'upstream_busy' }) : json(502, { ok: false, error: 'upstream_failed' });
});
