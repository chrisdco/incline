import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { aiTaskFlag, isFlagDisabled } from '../_shared/contracts/ai/flags.ts';
import { verifyBearerSub } from '../_shared/edge/auth.ts';
import { TASKS } from './tasks.ts';
import { completeJson, NotJsonError, upstreams, UpstreamError, type ChatMessage, type UpstreamUsage } from './upstream.ts';

/**
 * Generic AI gateway (AI-PLATFORM §1, §10 step 4). POST
 *   { task, promptVersion, input }
 * → { ok: true, cached, promptVersion, output, meta? } | { ok: false, error }.
 * `meta` is { model, usage: { prompt_tokens, completion_tokens } } summed over
 * retries — the app's "AI data use" record (FOUNDATION-REVIEW G9).
 *
 * Per request: Clerk auth → known task + prompt version → input validated by
 * the shared contract → remote kill switch → per-user cache → per-user daily
 * quota → upstream (primary, then fallback) with one repair retry → the same
 * hard output gate the app runs → cache. With no upstream key (or
 * AI_TASK_STUB=1) it serves the task's deterministic stub, so the whole path
 * can be smoke-tested without spending quota.
 */
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DAY_SECONDS = 24 * 60 * 60;
const FLAGS_TTL_MS = 60_000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
  if (flags && Date.now() - flags.at < FLAGS_TTL_MS) return flags.keys;
  const { data, error } = await db.from('ai_flags').select('key').eq('disabled', true);
  // Fail open on a flags read error: the kill switch must not become an outage.
  const keys = error ? (flags?.keys ?? []) : (data ?? []).map((r: { key: string }) => r.key);
  flags = { keys, at: Date.now() };
  return keys;
}

function useStub(): boolean {
  return Deno.env.get('AI_TASK_STUB') === '1' || upstreams().length === 0;
}

type Meta = { model: string; usage: { prompt_tokens: number; completion_tokens: number } };
type RunResult = { ok: true; output: unknown; meta: Meta | null } | { ok: false; status: number; error: string };

/** Below an attempt's useful minimum, stop rather than start a call that can't finish. */
const MIN_ATTEMPT_MS = 1_500;

/**
 * Primary then fallback, one repair retry each, all inside one deadline that
 * is shorter than the app's own timeout: once the app has given up, any work
 * here only burns quota.
 */
async function generate(
  messages: ChatMessage[],
  parse: (raw: unknown) => { ok: true; value: unknown } | { ok: false; error: string },
  budgetMs: number,
): Promise<RunResult> {
  const deadline = Date.now() + budgetMs;
  let rateLimited = false;
  let modelReplied = false;
  let meta: Meta | null = null;
  const onUsage = (u: UpstreamUsage) => {
    meta = {
      model: u.model,
      usage: {
        prompt_tokens: (meta?.usage.prompt_tokens ?? 0) + u.prompt_tokens,
        completion_tokens: (meta?.usage.completion_tokens ?? 0) + u.completion_tokens,
      },
    };
  };
  for (const up of upstreams()) {
    let hint: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_ATTEMPT_MS) break;
      const turn: ChatMessage[] = hint
        ? [...messages, { role: 'user', content: `Your last reply was rejected: ${hint}. Reply again with valid JSON only.` }]
        : messages;
      try {
        const checked = parse(await completeJson(up, turn, remaining, onUsage));
        modelReplied = true;
        if (checked.ok) return { ok: true, output: checked.value, meta };
        hint = checked.error;
      } catch (err) {
        if (err instanceof NotJsonError) {
          modelReplied = true;
          hint = err.message;
          continue;
        }
        if (err instanceof UpstreamError && err.status === 429) rateLimited = true;
        break; // next upstream
      }
    }
  }
  if (modelReplied) return { ok: false, status: 502, error: 'invalid_model_output' };
  if (rateLimited) return { ok: false, status: 429, error: 'upstream_busy' };
  return { ok: false, status: 502, error: 'upstream_failed' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

  const userId = await verifyBearerSub(req);
  if (!userId) return json(401, { ok: false, error: 'unauthorized' });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  const task = typeof body.task === 'string' ? TASKS[body.task] : undefined;
  if (!task) return json(404, { ok: false, error: 'unknown_task' });
  if (body.promptVersion !== task.promptVersion) {
    return json(409, { ok: false, error: 'unsupported_prompt_version', promptVersion: task.promptVersion });
  }
  const input = await task.parseInput(body.input);
  if (!input.ok) return json(400, { ok: false, error: input.error });

  const db = serviceClient();
  if (!db) return json(500, { ok: false, error: 'server_misconfigured' });

  if (isFlagDisabled(await disabledKeys(db), aiTaskFlag(task.id))) {
    return json(503, { ok: false, error: 'disabled' });
  }

  const cacheKey = await task.cacheKey(input.value);
  const { data: cached } = await db
    .from('ai_task_cache')
    .select('output')
    .eq('user_id', userId)
    .eq('task', task.id)
    .eq('prompt_version', task.promptVersion)
    .eq('cache_key', cacheKey)
    .maybeSingle();
  if (cached?.output) {
    const checked = task.parseOutput(cached.output, input.value);
    if (checked.ok) return json(200, { ok: true, cached: true, promptVersion: task.promptVersion, output: checked.value });
  }

  // Testers/staff get a multiple of the normal allowance (ai_user_tiers, service-only).
  const { data: tier } = await db.from('ai_user_tiers').select('multiplier').eq('user_id', userId).maybeSingle();
  const multiplier = Math.max(1, Math.min(100, Number(tier?.multiplier) || 1));
  const { data: allowed, error: rateError } = await db.rpc('ai_task_consume', {
    p_user: userId,
    p_task: task.id,
    p_limit: task.dailyLimit * multiplier,
    p_window_seconds: DAY_SECONDS,
  });
  if (rateError) return json(500, { ok: false, error: 'quota_unavailable' });
  if (allowed !== true) return json(429, { ok: false, error: 'rate_limited' });

  let output: unknown;
  let meta: Meta | null = null;
  const stub = useStub();
  if (stub) {
    const checked = task.parseOutput(task.stub(input.value), input.value);
    if (!checked.ok) return json(500, { ok: false, error: 'stub_invalid' });
    output = checked.value;
  } else {
    const result = await generate(task.messages(input.value), (raw) => task.parseOutput(raw, input.value), task.budgetMs);
    if (!result.ok) {
      // Nothing was produced: give the call back so an outage doesn't eat the day's quota.
      await db.rpc('ai_task_refund', { p_user: userId, p_task: task.id });
      return json(result.status, { ok: false, error: result.error });
    }
    output = result.output;
    meta = result.meta;
  }

  // Stub output is never cached, so real wording replaces it once a key is set.
  if (!stub) {
    await db.from('ai_task_cache').upsert({
      user_id: userId,
      task: task.id,
      prompt_version: task.promptVersion,
      cache_key: cacheKey,
      output,
    });
  }
  // Bounded cache without a cron: roughly one request in a hundred prunes old rows.
  if (Math.random() < 0.01) void db.rpc('ai_task_cache_prune');

  return json(200, { ok: true, cached: false, promptVersion: task.promptVersion, output, ...(meta ? { meta } : {}) });
});
