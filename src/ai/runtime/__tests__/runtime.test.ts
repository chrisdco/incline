import { describe, expect, it, vi } from 'vitest';

import type { ChatEvent, ChatPart, ModelPort, ModelRequest } from '@/contracts/ai/chat';
import { upgradeParts, textOf } from '@/contracts/ai/chat';
import { CHAT_READ_TOOLS, chatToolsFor, findTool } from '@/contracts/ai/chat-tools';
import { TOOLS } from '@/contracts/mcp/tools';

import { createOpenAiCompatModel, sseData } from '../adapters/openai-compat';
import { fenceToolResult, runChatTurn, type ToolImpl } from '../loop';
import { applyChatEvent, pendingToolCalls } from '../parts';

function sse(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

const line = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

describe('SSE + OpenAI-compatible adapter', () => {
  it('splits data lines across arbitrary chunk boundaries', async () => {
    const body = sse(['data: {"a"', ':1}\n\nda', 'ta: [DONE]\n\n']);
    expect(await collect(sseData(body))).toEqual(['{"a":1}', '[DONE]']);
  });

  it('streams text, assembles tool calls and reports usage', async () => {
    const body = sse([
      line({ choices: [{ delta: { content: 'Let me ' } }] }),
      line({ choices: [{ delta: { content: 'check.' } }] }),
      line({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'get_personal_records', arguments: '{"lim' } }] } }] }),
      line({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'it":5}' } }] }, finish_reason: 'tool_calls' }] }),
      line({ model: 'llama-x', choices: [], usage: { prompt_tokens: 300, completion_tokens: 20 } }),
      'data: [DONE]\n\n',
    ]);
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const sent = JSON.parse(String(init.body));
      expect(sent.stream).toBe(true);
      expect(sent.tools[0].function.name).toBe('get_profile');
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const model = createOpenAiCompatModel({ id: 'm', providerId: 'byok:groq', url: 'https://h/v1/chat/completions', model: 'cfg', fetchImpl });
    const events = await collect(model.stream({ messages: [{ role: 'user', content: 'hi' }], tools: CHAT_READ_TOOLS.slice(0, 1) }));
    expect(events.filter((e) => e.type === 'text_delta').map((e) => (e as { delta: string }).delta).join('')).toBe('Let me check.');
    expect(events).toContainEqual({ type: 'tool_call_end', id: 'c1', name: 'get_personal_records', args: { limit: 5 } });
    expect(events.at(-1)).toEqual({
      type: 'step_end',
      step: 0,
      finish: 'tool_calls',
      usage: { model: 'llama-x', inputTokens: 300, outputTokens: 20 },
    });
  });

  it('maps HTTP failures and network errors to chat error codes', async () => {
    const r429 = createOpenAiCompatModel({ id: 'm', providerId: 'p', url: 'u', model: 'x', fetchImpl: (async () => new Response('busy', { status: 429 })) as unknown as typeof fetch });
    expect((await collect(r429.stream({ messages: [] })))[0]).toMatchObject({ type: 'error', code: 'rate_limited' });
    const off = createOpenAiCompatModel({ id: 'm', providerId: 'p', url: 'u', model: 'x', fetchImpl: (async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch });
    expect((await collect(off.stream({ messages: [] })))[0]).toMatchObject({ type: 'error', code: 'offline' });
  });
});

/** Scripted model: each call to stream() plays the next step. */
function scripted(steps: ChatEvent[][]): ModelPort & { requests: ModelRequest[] } {
  const requests: ModelRequest[] = [];
  return {
    id: 'fake',
    providerId: 'fake',
    model: 'fake-1',
    supportsTools: true,
    requests,
    async *stream(req) {
      requests.push({ ...req, messages: [...req.messages] });
      for (const ev of steps.shift() ?? []) yield ev;
    },
  };
}

const prTool: ToolImpl = {
  spec: findTool('get_personal_records')!,
  run: async () => ({ records: [{ exercise: 'Bench Press', e1rm: 100 }] }),
};

describe('chat loop', () => {
  it('runs a tool, feeds the fenced result back and finishes with text', async () => {
    const model = scripted([
      [
        { type: 'tool_call_start', id: 'c1', name: 'get_personal_records' },
        { type: 'tool_call_end', id: 'c1', name: 'get_personal_records', args: {} },
        { type: 'step_end', step: 0, finish: 'tool_calls', usage: { inputTokens: 100, outputTokens: 5 } },
      ],
      [
        { type: 'text_delta', delta: 'Your bench e1RM is 100 kg.' },
        { type: 'step_end', step: 0, finish: 'stop', usage: { inputTokens: 150, outputTokens: 9 } },
      ],
    ]);
    const events = await collect(runChatTurn({ runId: 'r', model, system: 'sys', history: [], user: 'how is my bench?', tools: [prTool] }));
    expect(events[0]).toEqual({ type: 'run_start', runId: 'r' });
    expect(events.find((e) => e.type === 'tool_result')).toMatchObject({ name: 'get_personal_records', isError: false });
    expect(events.at(-1)).toEqual({ type: 'run_end', finish: 'stop', usage: { model: undefined, inputTokens: 250, outputTokens: 14 } });
    const second = model.requests[1]!.messages;
    expect(second.at(-2)).toMatchObject({ role: 'assistant', toolCalls: [{ id: 'c1', name: 'get_personal_records' }] });
    expect(second.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'c1' });
    expect((second.at(-1) as { content: string }).content.startsWith('<tool_data>')).toBe(true);

    const parts = events.reduce<ChatPart[]>(applyChatEvent, []);
    expect(parts.map((p) => p.type)).toEqual(['tool_call', 'tool_result', 'text']);
    expect(textOf(parts)).toBe('Your bench e1RM is 100 kg.');
    expect(pendingToolCalls(parts)).toEqual([]);
  });

  it('refuses unknown tools without crashing and stops at the step cap', async () => {
    const callStep: ChatEvent[] = [
      { type: 'tool_call_end', id: 'x', name: 'drop_tables', args: {} },
      { type: 'step_end', step: 0, finish: 'tool_calls' },
    ];
    const model = scripted([callStep, callStep, callStep]);
    const events = await collect(runChatTurn({ runId: 'r', model, system: 's', history: [], user: 'u', tools: [prTool], maxSteps: 2 }));
    expect(events.filter((e) => e.type === 'tool_result').every((e) => (e as { isError?: boolean }).isError)).toBe(true);
    expect(events.at(-2)).toMatchObject({ type: 'part', part: { type: 'notice', code: 'step_cap' } });
    expect(events.at(-1)).toMatchObject({ type: 'run_end', finish: 'step_cap' });
    expect(model.requests).toHaveLength(2);
  });

  it('ends once on a provider error, and on cancel', async () => {
    const failing = scripted([[{ type: 'error', code: 'rate_limited', message: '429' }]]);
    const ev = await collect(runChatTurn({ runId: 'r', model: failing, system: 's', history: [], user: 'u', tools: [] }));
    expect(ev.filter((e) => e.type === 'run_end')).toEqual([{ type: 'run_end', finish: 'error', usage: undefined }]);

    const ctrl = new AbortController();
    ctrl.abort();
    const cancelled = await collect(runChatTurn({ runId: 'r', model: scripted([]), system: 's', history: [], user: 'u', tools: [], signal: ctrl.signal }));
    expect(cancelled.at(-1)).toMatchObject({ type: 'run_end', finish: 'cancelled' });
  });

  it('fences and bounds tool output', () => {
    const big = fenceToolResult({ s: 'x'.repeat(20_000) });
    expect(big.length).toBeLessThan(8_100);
    expect(big.endsWith('</tool_data>')).toBe(true);
  });
});

describe('chat contracts', () => {
  it('chat read tools are the MCP read tools, with data categories', () => {
    const mcpRead = TOOLS.filter((t) => t.annotations.readOnlyHint).map((t) => t.name);
    expect(CHAT_READ_TOOLS.map((t) => t.name)).toEqual(mcpRead);
    expect(CHAT_READ_TOOLS).toHaveLength(9);
    expect(findTool('create_routine')).toBeUndefined();
    for (const t of CHAT_READ_TOOLS) expect(t.dataCategories.length).toBeGreaterThan(0);
    expect(chatToolsFor('session')).toHaveLength(9);
  });

  it('old readers drop unknown part types', () => {
    expect(upgradeParts([{ type: 'text', text: 'a' }, { type: 'hologram' }, null], 1)).toEqual([{ type: 'text', text: 'a' }]);
    expect(upgradeParts('nope', 1)).toEqual([]);
  });
});
