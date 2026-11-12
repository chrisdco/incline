import type { ChatErrorCode, ChatEvent, FinishReason, Json, ModelMessage, ModelPort, ModelRequest } from '@/contracts/ai/chat';
import { toOpenAiTool } from '@/contracts/ai/chat';
import { usageFromCompletion, type AiUsage } from '@/contracts/ai/data-use';

import { aiErrorFromFetch, aiErrorFromStatus } from '../../providers/http-errors';
import type { AiFailure } from '../../types';

/**
 * ModelPort over OpenAI-compatible streaming chat completions — the wire every
 * provider we use speaks: the `ai-chat` proxy, BYOK (Groq, OpenRouter, Gemini,
 * OpenAI) and local servers (Ollama, LM Studio). Server-sent events are read
 * from `fetch` (expo/fetch streams on native); nothing else is needed on
 * Hermes. Swapping to another runtime library means another adapter beside
 * this one (AI-CHAT §3A.4).
 */
export interface OpenAiCompatConfig {
  id: string;
  providerId: string;
  /** Full endpoint, e.g. https://api.groq.com/openai/v1/chat/completions or the ai-chat function. */
  url: string;
  model: string;
  supportsTools?: boolean;
  /** Resolved per request (keys stay in secure storage until a call). */
  headers?: () => Promise<Record<string, string>>;
  /** Extra body fields, e.g. `reasoning_effort`. */
  extraBody?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}

const FAILURE_TO_CODE: Record<AiFailure, ChatErrorCode> = {
  disabled: 'disabled',
  consent: 'consent',
  offline: 'offline',
  rate_limited: 'rate_limited',
  timeout: 'timeout',
  invalid_output: 'bad_response',
  unavailable: 'unavailable',
  cancelled: 'cancelled',
  error: 'error',
};

function toWire(m: ModelMessage): Record<string, unknown> {
  switch (m.role) {
    case 'assistant':
      return {
        role: 'assistant',
        content: m.content,
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args } })) }
          : {}),
      };
    case 'tool':
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    default:
      return { role: m.role, content: m.content };
  }
}

function finishOf(raw: unknown): FinishReason {
  switch (raw) {
    case 'stop':
    case 'tool_calls':
    case 'length':
    case 'content_filter':
      return raw;
    case 'function_call':
      return 'tool_calls';
    default:
      return 'unknown';
  }
}

function parseArgs(text: string): Json {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Json;
  } catch {
    // Handed on as-is; the tool's argument parser rejects it with an error the model can repair.
    return { _raw: text };
  }
}

/** Splits an SSE byte stream into `data:` payloads. Exported for tests. */
export async function* sseData(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl = buf.indexOf('\n');
      while (nl >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (line.startsWith('data:')) yield line.slice(5).trimStart();
        nl = buf.indexOf('\n');
      }
    }
    const tail = buf.trim();
    if (tail.startsWith('data:')) yield tail.slice(5).trimStart();
  } finally {
    reader.releaseLock();
  }
}

interface PendingCall {
  id: string;
  name: string;
  args: string;
}

interface StreamChunk {
  model?: string;
  error?: { message?: string };
  usage?: unknown;
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
    };
    finish_reason?: string | null;
  }[];
}

export function createOpenAiCompatModel(config: OpenAiCompatConfig): ModelPort {
  const doFetch = config.fetchImpl ?? fetch;
  return {
    id: config.id,
    providerId: config.providerId,
    model: config.model,
    supportsTools: config.supportsTools ?? true,
    async *stream(req: ModelRequest): AsyncGenerator<ChatEvent> {
      let res: Response;
      try {
        res = await doFetch(config.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(await config.headers?.()) },
          body: JSON.stringify({
            model: config.model,
            messages: req.messages.map(toWire),
            ...(req.tools?.length ? { tools: req.tools.map(toOpenAiTool), tool_choice: 'auto' } : {}),
            ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
            temperature: req.temperature ?? 0.3,
            stream: true,
            stream_options: { include_usage: true },
            ...config.extraBody,
          }),
          signal: req.signal,
        });
      } catch (err) {
        const e = aiErrorFromFetch(err, req.signal);
        yield { type: 'error', code: FAILURE_TO_CODE[e.kind], message: e.message };
        return;
      }
      if (!res.ok) {
        const e = aiErrorFromStatus(res.status, await res.text().catch(() => ''));
        yield { type: 'error', code: FAILURE_TO_CODE[e.kind], message: e.message };
        return;
      }
      if (!res.body) {
        yield { type: 'error', code: 'bad_response', message: 'no stream body' };
        return;
      }

      const calls = new Map<number, PendingCall>();
      let finish: FinishReason = 'unknown';
      let usage: AiUsage | undefined;
      try {
        for await (const data of sseData(res.body, req.signal)) {
          if (data === '[DONE]') break;
          let chunk: StreamChunk;
          try {
            chunk = JSON.parse(data) as StreamChunk;
          } catch {
            continue; // keep-alives and partial vendor lines
          }
          if (chunk.error) {
            yield { type: 'error', code: 'error', message: String(chunk.error.message ?? 'provider error').slice(0, 200) };
            return;
          }
          if (chunk.usage) usage = usageFromCompletion(chunk, config.model);
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta;
          if (delta?.content) yield { type: 'text_delta', delta: delta.content };
          for (const tc of delta?.tool_calls ?? []) {
            const index = tc.index ?? 0;
            let call = calls.get(index);
            if (!call) {
              call = { id: tc.id ?? `call_${index}`, name: tc.function?.name ?? '', args: '' };
              calls.set(index, call);
              yield { type: 'tool_call_start', id: call.id, name: call.name };
            } else if (tc.function?.name && !call.name) {
              call.name = tc.function.name;
            }
            if (tc.function?.arguments) {
              call.args += tc.function.arguments;
              yield { type: 'tool_call_args', id: call.id, delta: tc.function.arguments };
            }
          }
          if (choice.finish_reason) finish = finishOf(choice.finish_reason);
        }
      } catch (err) {
        const e = aiErrorFromFetch(err, req.signal);
        yield { type: 'error', code: FAILURE_TO_CODE[e.kind], message: e.message };
        return;
      }
      if (req.signal?.aborted) {
        yield { type: 'error', code: 'cancelled', message: 'cancelled' };
        return;
      }
      for (const call of calls.values()) {
        yield { type: 'tool_call_end', id: call.id, name: call.name, args: parseArgs(call.args) };
      }
      // Some hosts finish with "stop" even after issuing tool calls.
      if (calls.size && finish !== 'length') finish = 'tool_calls';
      yield { type: 'step_end', step: 0, finish, usage: usage ?? { model: config.model } };
    },
  };
}
