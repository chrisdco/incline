import {
  AiError,
  type AiAttempt,
  type AiEvent,
  type AiFailure,
  type AiProvider,
  type AiResult,
  type AiTask,
  type KvLike,
} from './types';

/**
 * Runs one task across an ordered provider chain (AI-ARCHITECTURE §3):
 * skip what can't serve it, try each with a timeout, one repair retry on a
 * rejected parse, fall through on failure, and finally hand back the task's
 * deterministic fallback. Never throws; the caller always gets something to
 * render.
 */
export interface RunAiTaskOptions {
  providers: readonly AiProvider[];
  /** Global AI switch and per-task kill switch, resolved by the caller. */
  enabled?: boolean;
  signal?: AbortSignal;
  cache?: KvLike;
  onEvent?: (event: AiEvent) => void;
}

/** When several providers fail differently, tell the user the most actionable one. */
const FAILURE_PRIORITY: AiFailure[] = [
  'cancelled',
  'offline',
  'rate_limited',
  'timeout',
  'invalid_output',
  'error',
  'unavailable',
  'disabled',
];

const CACHE_PREFIX = 'ai.cache.';
const inflight = new Map<string, Promise<AiResult<unknown>>>();

function worstFailure(attempts: AiAttempt[]): AiFailure {
  const seen = new Set(attempts.map((a) => a.outcome));
  return FAILURE_PRIORITY.find((f) => seen.has(f)) ?? 'unavailable';
}

function timeoutSignal(ms: number, outer?: AbortSignal): { signal: AbortSignal; clear: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let fired = false;
  const timer = setTimeout(() => {
    fired = true;
    controller.abort();
  }, ms);
  const onOuter = () => controller.abort();
  outer?.addEventListener('abort', onOuter);
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuter);
    },
    timedOut: () => fired,
  };
}

async function attemptProvider<I, O>(
  task: AiTask<I, O>,
  input: I,
  provider: AiProvider,
  outer: AbortSignal | undefined,
  attempts: AiAttempt[],
): Promise<O | null> {
  let repairHint: string | undefined;
  const tries = provider.repairable ? 2 : 1;
  for (let i = 0; i < tries; i++) {
    const started = Date.now();
    const t = timeoutSignal(task.timeoutMs, outer);
    try {
      const raw = await provider.run(task as AiTask<I, unknown>, input, { signal: t.signal, repairHint });
      const parsed = task.parse(raw, input);
      if (parsed.ok) {
        attempts.push({ providerId: provider.id, outcome: 'ok', latencyMs: Date.now() - started });
        return parsed.output;
      }
      attempts.push({ providerId: provider.id, outcome: 'invalid_output', latencyMs: Date.now() - started, detail: parsed.error });
      repairHint = parsed.error;
    } catch (err) {
      let kind: AiFailure = err instanceof AiError ? err.kind : 'error';
      if (outer?.aborted) kind = 'cancelled';
      else if (t.timedOut()) kind = 'timeout';
      attempts.push({
        providerId: provider.id,
        outcome: kind,
        latencyMs: Date.now() - started,
        detail: err instanceof Error ? err.message.slice(0, 200) : undefined,
      });
      // A transport failure won't be fixed by a repair prompt.
      if (kind !== 'invalid_output') return null;
      repairHint = err instanceof Error ? err.message : 'invalid output';
    } finally {
      t.clear();
    }
  }
  return null;
}

async function execute<I, O>(task: AiTask<I, O>, input: I, opts: RunAiTaskOptions, cacheKey: string | null): Promise<AiResult<O>> {
  const attempts: AiAttempt[] = [];

  if (cacheKey && opts.cache) {
    try {
      const hit = await opts.cache.getItem(cacheKey);
      if (hit) {
        const parsed = task.parse(JSON.parse(hit), input);
        if (parsed.ok) return { status: 'ok', output: parsed.output, providerId: 'cache', cached: true, attempts };
      }
    } catch {
      // A bad cache entry is just a miss.
    }
  }

  let offline = false;
  for (const provider of opts.providers) {
    if (opts.signal?.aborted) break;
    const needs = task.needs ?? {};
    if (
      !provider.supports(task as AiTask<unknown, unknown>) ||
      (needs.toolCalling && !provider.capabilities.toolCalling) ||
      (needs.structuredOutput && !provider.capabilities.structuredOutput)
    ) {
      continue;
    }
    // Once the network is gone, only on-device providers are worth trying.
    if (offline && !provider.capabilities.onDevice) continue;
    let available = false;
    try {
      available = await provider.isAvailable();
    } catch {
      available = false;
    }
    if (!available) {
      attempts.push({ providerId: provider.id, outcome: 'unavailable', latencyMs: 0 });
      continue;
    }
    const output = await attemptProvider(task, input, provider, opts.signal, attempts);
    if (output !== null) {
      if (cacheKey && opts.cache) {
        await opts.cache.setItem(cacheKey, JSON.stringify(output)).catch(() => undefined);
      }
      return { status: 'ok', output, providerId: provider.id, cached: false, attempts };
    }
    const last = attempts[attempts.length - 1]?.outcome;
    if (last === 'cancelled') break;
    if (last === 'offline') offline = true;
  }

  const reason = opts.signal?.aborted ? 'cancelled' : attempts.length ? worstFailure(attempts) : 'unavailable';
  return { status: 'fallback', reason, output: safeFallback(task, input), attempts };
}

function safeFallback<I, O>(task: AiTask<I, O>, input: I): O | null {
  try {
    return task.fallback(input);
  } catch {
    return null;
  }
}

export async function runAiTask<I, O>(task: AiTask<I, O>, input: I, opts: RunAiTaskOptions): Promise<AiResult<O>> {
  let result: AiResult<O>;
  try {
    if (opts.enabled === false) {
      result = { status: 'fallback', reason: 'disabled', output: safeFallback(task, input), attempts: [] };
    } else {
      const rawKey = task.cacheKey ? await task.cacheKey(input) : null;
      const cacheKey = rawKey ? `${CACHE_PREFIX}${task.id}.${task.promptVersion}.${rawKey}` : null;
      if (cacheKey) {
        const existing = inflight.get(cacheKey) as Promise<AiResult<O>> | undefined;
        if (existing) return await existing;
      }
      const pending = execute(task, input, opts, cacheKey);
      if (cacheKey) inflight.set(cacheKey, pending as Promise<AiResult<unknown>>);
      try {
        result = await pending;
      } finally {
        if (cacheKey) inflight.delete(cacheKey);
      }
    }
  } catch (err) {
    result = {
      status: 'fallback',
      reason: 'error',
      output: safeFallback(task, input),
      attempts: [{ providerId: 'router', outcome: 'error', latencyMs: 0, detail: String(err).slice(0, 200) }],
    };
  }
  try {
    opts.onEvent?.({
      taskId: task.id,
      promptVersion: task.promptVersion,
      status: result.status,
      reason: result.status === 'fallback' ? result.reason : undefined,
      providerId: result.status === 'ok' ? result.providerId : undefined,
      cached: result.status === 'ok' && result.cached,
      attempts: result.attempts,
    });
  } catch {
    // Telemetry must never break a task.
  }
  return result;
}

export const AI_CACHE_PREFIX = CACHE_PREFIX;
