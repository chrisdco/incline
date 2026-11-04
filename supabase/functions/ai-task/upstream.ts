/**
 * OpenAI-compatible upstreams for `ai-task`. Point AI_BASE_URL at a Cloudflare
 * AI Gateway URL (…/v1/<account>/<gateway>/groq) to get caching, logs and
 * provider switching with no app release; CF_AIG_TOKEN is sent when the
 * gateway requires auth. An optional fallback upstream is tried on failure.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Upstream {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort?: string;
}

export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function env(name: string): string | undefined {
  const v = Deno.env.get(name)?.trim();
  return v ? v : undefined;
}

/** The model answered, but not with JSON: worth one repair retry. */
export class NotJsonError extends Error {}

export function upstreams(): Upstream[] {
  const out: Upstream[] = [];
  const key = env('AI_API_KEY') ?? env('GROQ_API_KEY');
  if (key) {
    out.push({
      id: 'primary',
      baseUrl: (env('AI_BASE_URL') ?? 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
      apiKey: key,
      model: env('AI_MODEL') ?? 'openai/gpt-oss-20b',
      reasoningEffort: env('AI_REASONING_EFFORT') ?? 'low',
    });
  }
  const fbKey = env('AI_FALLBACK_API_KEY');
  const fbUrl = env('AI_FALLBACK_BASE_URL');
  const fbModel = env('AI_FALLBACK_MODEL');
  if (fbKey && fbUrl && fbModel) {
    out.push({ id: 'fallback', baseUrl: fbUrl.replace(/\/+$/, ''), apiKey: fbKey, model: fbModel });
  }
  return out;
}

/** One JSON-mode completion. Throws UpstreamError on HTTP errors, Error otherwise. */
export async function completeJson(up: Upstream, messages: ChatMessage[], timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${up.apiKey}`,
    'Content-Type': 'application/json',
  };
  const aig = env('CF_AIG_TOKEN');
  if (aig) headers['cf-aig-authorization'] = `Bearer ${aig}`;
  try {
    const res = await fetch(`${up.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: up.model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        ...(up.reasoningEffort ? { reasoning_effort: up.reasoningEffort } : {}),
        messages,
      }),
    });
    if (!res.ok) throw new UpstreamError(res.status, `${up.id} HTTP ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error(`${up.id} empty completion`);
    try {
      return JSON.parse(content);
    } catch {
      throw new NotJsonError('reply was not JSON');
    }
  } finally {
    clearTimeout(timer);
  }
}
