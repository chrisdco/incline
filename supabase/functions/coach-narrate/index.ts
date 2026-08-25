import { createClient } from 'npm:@supabase/supabase-js@2';
import * as jose from 'npm:jose@5';

import {
  COACH_NARRATE_PROMPT_VERSION,
  hashFeaturePack,
  stubNarration,
  validateFeaturePack,
  validateNarrationResponse,
  type CoachNarration,
  type FeaturePackV1,
  type NarrateSurface,
} from './schema.ts';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RATE_LIMIT_PER_DAY = 10;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const SYSTEM_PROMPT = `You are a copywriter for a strength-training coach app.
You ONLY narrate the FeaturePack JSON the user provides.

Rules:
- Never invent numbers, loads, reps, percentages, PRs, or dates. Repeat only values present in the pack.
- Do not give medical advice or diagnose injury.
- You do not change the training plan. Rules already computed the numbers.
- Cite the insight ids you used in citedInsightIds (must be a subset of pack.insights[].id).
- Output JSON only: { "headline": string (max 80 characters), "paragraphs": string[1-3], "citedInsightIds": string[] }
- Headline is a short coaching line. Paragraphs are 1–3 short paragraphs in plain language.`;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jwksUrl(): string | null {
  const direct = Deno.env.get('CLERK_JWKS_URL') ?? Deno.env.get('SUPABASE_JWKS');
  if (direct) return direct;
  const frontend = Deno.env.get('CLERK_FRONTEND_API');
  if (frontend) {
    const host = frontend.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${host}/.well-known/jwks.json`;
  }
  return null;
}

async function verifyBearerSub(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization');
  if (!auth?.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;
  const url = jwksUrl();
  if (!url) return null;
  try {
    const JWKS = jose.createRemoteJWKSet(new URL(url));
    const audience = Deno.env.get('COACH_NARRATE_JWT_AUD') ?? 'authenticated';
    const { payload } = await jose.jwtVerify(token, JWKS, { audience });
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    try {
      const JWKS = jose.createRemoteJWKSet(new URL(url));
      const { payload } = await jose.jwtVerify(token, JWKS);
      return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
    } catch {
      return null;
    }
  }
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function consumeRate(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('coach_narrate_rate')
    .select('window_start, count')
    .eq('user_id', userId)
    .maybeSingle();
  const now = Date.now();
  if (!data || now - new Date(data.window_start as string).getTime() >= RATE_WINDOW_MS) {
    const { error } = await admin.from('coach_narrate_rate').upsert({
      user_id: userId,
      window_start: new Date(now).toISOString(),
      count: 1,
    });
    return !error;
  }
  if ((data.count as number) >= RATE_LIMIT_PER_DAY) return false;
  const { error } = await admin
    .from('coach_narrate_rate')
    .update({ count: (data.count as number) + 1 })
    .eq('user_id', userId);
  return !error;
}

function useStub(): boolean {
  if (Deno.env.get('COACH_NARRATE_STUB') === '1') return true;
  return !Deno.env.get('OPENAI_API_KEY');
}

function llmBaseUrl(): string {
  const raw = Deno.env.get('COACH_NARRATE_BASE_URL') ?? 'https://api.openai.com/v1';
  return raw.replace(/\/+$/, '');
}

async function completeNarration(pack: FeaturePackV1): Promise<unknown> {
  const model = Deno.env.get('COACH_NARRATE_MODEL') ?? 'gpt-4o-mini';
  const key = Deno.env.get('OPENAI_API_KEY') ?? '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${llmBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(pack) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('empty completion');
    return JSON.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'method_not_allowed' });
  }

  const userId = await verifyBearerSub(req);
  if (!userId) return json(401, { ok: false, error: 'unauthorized' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }
  if (!body || typeof body !== 'object') {
    return json(400, { ok: false, error: 'invalid_body' });
  }
  const rec = body as Record<string, unknown>;
  const promptVersion = rec.promptVersion;
  const surface = rec.surface as NarrateSurface | undefined;
  const packHash = rec.packHash;
  if (promptVersion !== COACH_NARRATE_PROMPT_VERSION) {
    return json(400, { ok: false, error: 'unsupported_prompt_version' });
  }
  if (surface !== 'post_session' && surface !== 'home') {
    return json(400, { ok: false, error: 'invalid_surface' });
  }
  if (typeof packHash !== 'string' || !packHash) {
    return json(400, { ok: false, error: 'pack_hash_required' });
  }

  const packed = validateFeaturePack(rec.pack);
  if (!packed.ok) return json(400, { ok: false, error: packed.error });
  if (packed.pack.surface !== surface) {
    return json(400, { ok: false, error: 'surface_mismatch' });
  }

  const recomputed = await hashFeaturePack(packed.pack);
  if (recomputed !== packHash) {
    return json(400, { ok: false, error: 'pack_hash_mismatch' });
  }

  const admin = serviceClient();
  if (!admin) return json(500, { ok: false, error: 'server_misconfigured' });

  const { data: cached } = await admin
    .from('coach_narration_cache')
    .select('narration')
    .eq('user_id', userId)
    .eq('pack_hash', packHash)
    .eq('prompt_version', promptVersion)
    .eq('surface', surface)
    .maybeSingle();

  if (cached?.narration) {
    const checked = validateNarrationResponse(cached.narration, packed.pack);
    if (checked.ok) {
      return json(200, {
        ok: true,
        cached: true,
        promptVersion,
        narration: checked.narration,
      });
    }
  }

  const allowed = await consumeRate(admin, userId);
  if (!allowed) return json(429, { ok: false, error: 'rate_limited' });

  let narration: CoachNarration;
  if (useStub()) {
    narration = stubNarration(packed.pack);
    const checked = validateNarrationResponse(narration, packed.pack);
    if (!checked.ok) return json(500, { ok: false, error: 'stub_invalid' });
    narration = checked.narration;
  } else {
    try {
      const raw = await completeNarration(packed.pack);
      const checked = validateNarrationResponse(raw, packed.pack);
      if (!checked.ok) return json(502, { ok: false, error: 'invalid_model_output' });
      narration = checked.narration;
    } catch {
      return json(502, { ok: false, error: 'model_failed' });
    }
  }

  await admin.from('coach_narration_cache').upsert({
    user_id: userId,
    pack_hash: packHash,
    prompt_version: promptVersion,
    surface,
    narration,
  });

  return json(200, {
    ok: true,
    cached: false,
    promptVersion,
    narration,
  });
});
