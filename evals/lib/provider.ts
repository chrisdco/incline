/**
 * Minimal OpenAI-compatible chat client for evals. Works with Groq,
 * OpenRouter, Ollama, LM Studio, Gemini's OpenAI endpoint, or the built-in
 * stub. Configure with env vars:
 *
 *   EVAL_BASE_URL  e.g. http://localhost:11434/v1, https://api.groq.com/openai/v1,
 *                  https://openrouter.ai/api/v1   (or "stub")
 *   EVAL_MODEL     e.g. qwen3:4b, openai/gpt-oss-20b, meta-llama/llama-3.3-8b-instruct:free
 *   EVAL_API_KEY   optional for local servers
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionResult {
  text: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface EvalProvider {
  id: string;
  complete(messages: ChatMessage[], opts?: { json?: boolean; temperature?: number }): Promise<CompletionResult>;
}

export type StubResponder = (messages: ChatMessage[]) => string;

export function providerFromEnv(stub: StubResponder): EvalProvider | null {
  const baseUrl = process.env.EVAL_BASE_URL?.trim();
  if (!baseUrl) return null;
  if (baseUrl === 'stub') {
    return {
      id: 'stub',
      async complete(messages) {
        const started = performance.now();
        const text = stub(messages);
        return { text, latencyMs: performance.now() - started, promptTokens: null, completionTokens: null };
      },
    };
  }
  const model = process.env.EVAL_MODEL?.trim();
  if (!model) throw new Error('EVAL_MODEL is required when EVAL_BASE_URL is set');
  const apiKey = process.env.EVAL_API_KEY?.trim();
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  return {
    id: `${new URL(baseUrl).host}:${model}`,
    async complete(messages, opts = {}) {
      const started = performance.now();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.4,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      const latencyMs = performance.now() - started;
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: data.choices?.[0]?.message?.content ?? '',
        latencyMs,
        promptTokens: data.usage?.prompt_tokens ?? null,
        completionTokens: data.usage?.completion_tokens ?? null,
      };
    },
  };
}

/** Pull the first JSON object out of model text (models often wrap it in fences or prose). */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
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
