import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/kv', () => ({ kvStorage: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } }));

import { addUsage, usageFromCompletion } from '@/contracts/ai/data-use';

import { createChatProvider } from '../providers/chat';
import { createGatewayProvider } from '../providers/gateway';
import {
  appendEntries,
  dataUseProviderLabel,
  entriesFromEvent,
  exportDataUse,
  MAX_ENTRIES,
  summarizeDataUse,
  type AiDataUseEntry,
} from '../data-use';
import { runAiTask } from '../router';
import type { AiEvent, AiTask } from '../types';

const event = (over: Partial<AiEvent> = {}): AiEvent => ({
  taskId: 'plan_edit',
  promptVersion: 'v1',
  status: 'ok',
  cached: false,
  dataCategories: ['routines', 'message'],
  attempts: [
    { providerId: 'byok:groq', outcome: 'unavailable', latencyMs: 0 },
    { providerId: 'byok:groq', outcome: 'timeout', latencyMs: 9000 },
    { providerId: 'gateway', outcome: 'ok', latencyMs: 800, model: 'gpt-oss-20b', inputTokens: 900, outputTokens: 120 },
  ],
  ...over,
});

describe('AI data use record (G9)', () => {
  it('records only attempts that reached a provider, with categories and usage', () => {
    const e = entriesFromEvent(event(), 1000);
    expect(e.map((x) => [x.providerId, x.outcome])).toEqual([
      ['byok:groq', 'timeout'],
      ['gateway', 'ok'],
    ]);
    expect(e[1]).toMatchObject({ at: 1000, task: 'plan_edit', model: 'gpt-oss-20b', inputTokens: 900, categories: ['routines', 'message'] });
  });

  it('cache hits and consent / offline / disabled send nothing', () => {
    expect(entriesFromEvent(event({ cached: true }))).toEqual([]);
    const blocked = event({
      status: 'fallback',
      attempts: [
        { providerId: 'gateway', outcome: 'offline', latencyMs: 3 },
        { providerId: 'router', outcome: 'error', latencyMs: 0 },
      ],
    });
    expect(entriesFromEvent(blocked)).toEqual([]);
  });

  it('keeps newest first and stays bounded', () => {
    const one = (at: number): AiDataUseEntry => ({ at, task: 't', providerId: 'gateway', categories: [], outcome: 'ok' });
    let list: AiDataUseEntry[] = [];
    for (let i = 0; i < MAX_ENTRIES + 25; i++) list = appendEntries(list, [one(i)]);
    expect(list).toHaveLength(MAX_ENTRIES);
    expect(list[0]!.at).toBe(MAX_ENTRIES + 24);
    const s = summarizeDataUse(entriesFromEvent(event(), 5));
    expect(s).toMatchObject({ requests: 2, inputTokens: 900, outputTokens: 120, since: 5 });
    expect(JSON.parse(exportDataUse(list.slice(0, 1)))).toMatchObject({ format: 'incline.ai-data-use', version: 1 });
  });

  it('labels providers for people', () => {
    expect(dataUseProviderLabel('gateway')).toBe('Incline AI');
    expect(dataUseProviderLabel('byok:groq')).toBe('Groq (your key)');
  });

  it('reads OpenAI-style usage and sums retries', () => {
    const u = usageFromCompletion({ model: 'm1', usage: { prompt_tokens: 10, completion_tokens: 2 } });
    expect(u).toEqual({ model: 'm1', inputTokens: 10, outputTokens: 2 });
    expect(usageFromCompletion(null, 'cfg')).toEqual({ model: 'cfg', inputTokens: undefined, outputTokens: undefined });
    expect(addUsage(u, { model: 'm2', inputTokens: 5 })).toEqual({ model: 'm2', inputTokens: 15, outputTokens: 2 });
  });
});

describe('providers report usage into attempts', () => {
  const task: AiTask<string, { a: number }> = {
    id: 't',
    promptVersion: 'v1',
    tier: 'small',
    dataCategories: ['summaries'],
    timeoutMs: 1000,
    buildMessages: (i) => [{ role: 'user', content: i }],
    parse: (raw) => (raw && typeof (raw as { a?: unknown }).a === 'number' ? { ok: true, output: raw as { a: number } } : { ok: false, error: 'bad' }),
    fallback: () => null,
    gateway: { fn: 'ai-task', body: (i) => ({ i }), pick: (j) => (j as { output?: unknown }).output },
  };

  it('chat provider: model + tokens from the completion, summed over a repair', async () => {
    const replies = ['{"b":1}', '{"a":1}'];
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ model: 'llama-x', usage: { prompt_tokens: 100, completion_tokens: 5 }, choices: [{ message: { content: replies.shift() } }] }),
      ),
    ) as unknown as typeof fetch;
    const provider = createChatProvider({ id: 'byok:groq', baseUrl: 'https://h/v1', model: 'cfg', fetchImpl });
    const events: AiEvent[] = [];
    const r = await runAiTask(task, 'x', { providers: [provider], onEvent: (e) => events.push(e) });
    expect(r.status).toBe('ok');
    const [first, second] = events[0]!.attempts;
    expect(first).toMatchObject({ outcome: 'invalid_output', model: 'llama-x', inputTokens: 100 });
    expect(second).toMatchObject({ outcome: 'ok', model: 'llama-x', inputTokens: 100, outputTokens: 5 });
    expect(events[0]!.dataCategories).toEqual(['summaries']);
  });

  it('gateway provider: reads `meta`, tolerates servers without it', async () => {
    const bodies = [
      { ok: true, output: { a: 1 }, meta: { model: 'gpt-oss-20b', usage: { prompt_tokens: 50, completion_tokens: 9 } } },
      { ok: true, output: { a: 1 } },
    ];
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(bodies.shift()))) as unknown as typeof fetch;
    const provider = createGatewayProvider({ supabaseUrl: 'https://x.supabase.co', anonKey: 'a', getToken: async () => 't', fetchImpl });
    const events: AiEvent[] = [];
    await runAiTask(task, 'x', { providers: [provider], onEvent: (e) => events.push(e) });
    await runAiTask(task, 'y', { providers: [provider], onEvent: (e) => events.push(e) });
    expect(events[0]!.attempts[0]).toMatchObject({ model: 'gpt-oss-20b', inputTokens: 50, outputTokens: 9 });
    expect(events[1]!.attempts[0]!.model).toBeUndefined();
  });
});
