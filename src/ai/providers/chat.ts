import { parseJsonLoose } from '../json';
import { AiError, type AiProvider, type ChatMessage, type ProviderCapabilities } from '../types';
import { aiErrorFromFetch, aiErrorFromStatus } from './http-errors';

/**
 * OpenAI-compatible chat provider: BYOK (OpenRouter, Groq, Gemini, OpenAI…)
 * and local servers (Ollama / LM Studio on the LAN). Runs the task's own
 * messages from the device; the key never leaves the device except to the
 * user's chosen endpoint.
 */
export interface ChatProviderConfig {
  id: string;
  baseUrl: string;
  model: string;
  /** Resolved lazily so the key stays in secure storage until a call. */
  getApiKey?: () => Promise<string | null>;
  capabilities?: Partial<ProviderCapabilities>;
  /** none | low | medium | high — omitted when unset. */
  reasoningEffort?: string;
  /**
   * Send the task's `outputSchema` as `json_schema`. Only for hosts that
   * constrain decoding (Ollama, llama.cpp, OpenAI): qwen3:4b went 12/20 → 20/20.
   * Groq validates after generation and 400s on a miss (15/20 vs 20/20 with
   * json_object), so it stays off there. See evals/README.md.
   */
  strictSchema?: boolean;
  fetchImpl?: typeof fetch;
}

export function createChatProvider(config: ChatProviderConfig): AiProvider {
  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  return {
    id: config.id,
    repairable: true,
    capabilities: {
      structuredOutput: config.capabilities?.structuredOutput ?? true,
      toolCalling: config.capabilities?.toolCalling ?? false,
      onDevice: false,
    },
    async isAvailable() {
      if (!config.baseUrl || !config.model) return false;
      if (!config.getApiKey) return true;
      return Boolean(await config.getApiKey());
    },
    supports() {
      return true;
    },
    async run(task, input, ctx) {
      const messages: ChatMessage[] = task.buildMessages(input);
      if (ctx.repairHint) {
        messages.push({
          role: 'user',
          content: `Your previous reply was rejected: ${ctx.repairHint}. Reply again with valid JSON only, following every rule.`,
        });
      }
      const key = config.getApiKey ? await config.getApiKey() : null;
      let res: Response;
      try {
        res = await (config.fetchImpl ?? fetch)(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            temperature: 0.4,
            response_format:
              config.strictSchema && task.outputSchema
                ? { type: 'json_schema', json_schema: { name: task.id, strict: true, schema: task.outputSchema } }
                : { type: 'json_object' },
            ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
          }),
          signal: ctx.signal,
        });
      } catch (err) {
        throw aiErrorFromFetch(err, ctx.signal);
      }
      if (!res.ok) throw aiErrorFromStatus(res.status, await res.text().catch(() => ''));
      const data = (await res.json().catch(() => null)) as {
        choices?: { message?: { content?: string | null } }[];
      } | null;
      const text = data?.choices?.[0]?.message?.content ?? '';
      const parsed = parseJsonLoose(text);
      if (parsed === undefined) throw new AiError('invalid_output', 'reply was not JSON');
      return parsed;
    },
  };
}
