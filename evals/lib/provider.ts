/**
 * Minimal OpenAI-compatible chat client for evals. Works with Groq,
 * OpenRouter, Ollama, LM Studio, Gemini's OpenAI endpoint, or the built-in
 * stub. Pick a preset with EVAL_PROVIDER (keys come from gitignored
 * .env.local) and override with:
 *
 *   EVAL_BASE_URL          e.g. http://localhost:11434/v1 (or "stub")
 *   EVAL_MODEL             e.g. qwen3:4b, openai/gpt-oss-20b, <model>:free
 *   EVAL_API_KEY           optional for local servers
 *   EVAL_REASONING_EFFORT  none | low | medium | high ("" to omit)
 *   EVAL_TIMEOUT_MS        per request, default 120000
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface CompleteOptions {
  json?: boolean;
  /** OpenAI-style `json_schema` structured output (not every host supports it). */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  temperature?: number;
  tools?: ToolSpec[];
  toolChoice?: 'auto' | 'required' | 'none';
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  toolCalls: ToolCall[];
  finishReason: string | null;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  /** Rate-limit headers as returned (x-ratelimit-*, retry-after). */
  rateLimit: Record<string, string>;
  /** 429 retries spent before success. */
  retries: number;
}

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

export interface EvalProvider {
  id: string;
  model: string;
  complete(messages: ChatMessage[], opts?: CompleteOptions): Promise<CompletionResult>;
}

export type StubResponder = (messages: ChatMessage[]) => string;

interface Preset {
  baseUrl: string;
  model: string;
  keyEnv?: string;
  reasoningEffort?: string;
}

/** Named presets so a run is just `EVAL_PROVIDER=groq`. */
export const PRESETS: Record<string, Preset> = {
  // CPU-only qwen3 thinks for ~40 s a call; "none" brings it to ~2 s.
  ollama: { baseUrl: 'http://localhost:11434/v1', model: 'qwen3:4b', reasoningEffort: 'none' },
  // gpt-oss reasoning tokens count against the 8K TPM free cap; keep them low.
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b', keyEnv: 'GROQ_API_KEY', reasoningEffort: 'low' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: '', keyEnv: 'OPENROUTER_API_KEY' },
};

export interface ProviderConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  reasoningEffort?: string;
  timeoutMs: number;
}

export function providerConfigFromEnv(): ProviderConfig | 'stub' | null {
  const preset = PRESETS[process.env.EVAL_PROVIDER?.trim() ?? ''];
  const baseUrl = process.env.EVAL_BASE_URL?.trim() || preset?.baseUrl;
  if (!baseUrl) return null;
  if (baseUrl === 'stub') return 'stub';
  const model = process.env.EVAL_MODEL?.trim() || preset?.model;
  if (!model) throw new Error('EVAL_MODEL is required for this provider');
  const apiKey = process.env.EVAL_API_KEY?.trim() || (preset?.keyEnv ? process.env[preset.keyEnv]?.trim() : undefined);
  const effortEnv = process.env.EVAL_REASONING_EFFORT;
  const reasoningEffort = effortEnv !== undefined ? effortEnv.trim() || undefined : preset?.reasoningEffort;
  const timeoutMs = Number(process.env.EVAL_TIMEOUT_MS ?? 120_000);
  return { baseUrl, model, apiKey, reasoningEffort, timeoutMs };
}

const MAX_429_RETRIES = 5;

/** Seconds to wait from retry-after or Groq/OpenRouter's "try again in 7.5s" text. */
function retryDelayMs(res: Response, body: string): number {
  const header = res.headers.get('retry-after');
  if (header && Number.isFinite(Number(header))) return Number(header) * 1000 + 250;
  const m = /try again in ([\d.]+)(ms|s)/i.exec(body);
  if (m) return Number(m[1]) * (m[2] === 'ms' ? 1 : 1000) + 250;
  return 5_000;
}

function pickRateLimitHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    if (key.startsWith('x-ratelimit') || key === 'retry-after') out[key] = value;
  });
  return out;
}

export function providerFromEnv(stub: StubResponder): EvalProvider | null {
  const config = providerConfigFromEnv();
  if (!config) return null;
  if (config === 'stub') {
    return {
      id: 'stub',
      model: 'stub',
      async complete(messages) {
        const started = performance.now();
        const text = stub(messages);
        return {
          text,
          toolCalls: [],
          finishReason: 'stop',
          latencyMs: performance.now() - started,
          promptTokens: null,
          completionTokens: null,
          rateLimit: {},
          retries: 0,
        };
      },
    };
  }
  return createProvider(config);
}

export function createProvider(config: ProviderConfig): EvalProvider {
  const { baseUrl, model, apiKey, reasoningEffort, timeoutMs } = config;
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  return {
    id: `${new URL(baseUrl).host}:${model}${reasoningEffort ? `@${reasoningEffort}` : ''}`,
    model,
    async complete(messages, opts = {}) {
      const responseFormat = opts.jsonSchema
        ? { type: 'json_schema', json_schema: { name: opts.jsonSchema.name, strict: true, schema: opts.jsonSchema.schema } }
        : opts.json
          ? { type: 'json_object' }
          : undefined;
      const body = JSON.stringify({
        model,
        messages,
        temperature: opts.temperature ?? 0.4,
        ...(responseFormat ? { response_format: responseFormat } : {}),
        ...(opts.tools ? { tools: opts.tools, tool_choice: opts.toolChoice ?? 'auto' } : {}),
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      });

      let retries = 0;
      for (;;) {
        const started = performance.now();
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
        const latencyMs = performance.now() - started;
        if (res.status === 429 && retries < MAX_429_RETRIES) {
          const text = await res.text().catch(() => '');
          retries += 1;
          await new Promise((r) => setTimeout(r, retryDelayMs(res, text)));
          continue;
        }
        if (!res.ok) throw new ProviderHttpError(res.status, await res.text().catch(() => ''));
        const data = (await res.json()) as {
          choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const choice = data.choices?.[0];
        return {
          text: choice?.message?.content ?? '',
          toolCalls: choice?.message?.tool_calls ?? [],
          finishReason: choice?.finish_reason ?? null,
          latencyMs,
          promptTokens: data.usage?.prompt_tokens ?? null,
          completionTokens: data.usage?.completion_tokens ?? null,
          rateLimit: pickRateLimitHeaders(res),
          retries,
        };
      }
    },
  };
}

/** Pull the first JSON object out of model text (models often wrap it in fences or prose). */
export function parseJsonLoose(text: string): unknown {
  // Reasoning models (qwen3, gpt-oss on some hosts) may prepend <think> blocks.
  const trimmed = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return undefined;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

/** Fixture subset for quick runs: EVAL_LIMIT=5. */
export function limitFixtures<T>(fixtures: T[]): T[] {
  const n = Number(process.env.EVAL_LIMIT ?? 0);
  return n > 0 ? fixtures.slice(0, n) : fixtures;
}
