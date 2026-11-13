import type { ChatEvent, ChatPart, Json, ModelMessage, ModelPort, RunFinish, ToolSpec } from '@/contracts/ai/chat';
import { addUsage, type AiUsage } from '@/contracts/ai/data-use';

/**
 * The chat agent loop (AI-CHAT §3, §3A.1): runs on the device, model steps
 * through a ModelPort, tools against local SQLite, capped at `maxSteps`.
 * Policies live here, not in the model: only registered tools run, reads and
 * proposals only (a propose tool never writes; its result becomes a card the
 * user applies), results are fenced as data, and every run ends with exactly
 * one `run_end`. Never throws.
 */
export interface ToolImpl {
  spec: ToolSpec;
  run(args: Json, ctx: { signal?: AbortSignal }): Promise<Json>;
  /** Propose tools: the card shown for a successful result. */
  toPart?(result: Json): ChatPart | null;
}

export interface RunTurnOptions {
  runId: string;
  model: ModelPort;
  system: string;
  /** Earlier turns, already in model shape (running summary + last N). */
  history: ModelMessage[];
  user: string;
  tools: readonly ToolImpl[];
  maxSteps?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export const DEFAULT_MAX_STEPS = 5;
/** A tool result bigger than this is cut; tools should already return top-N summaries. */
export const MAX_TOOL_RESULT_CHARS = 8_000;

/** Tool output is user data, never instructions (#153): the model sees it fenced and labelled. */
export function fenceToolResult(result: Json): string {
  let text = JSON.stringify(result);
  if (text.length > MAX_TOOL_RESULT_CHARS) text = `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…(truncated)`;
  return `<tool_data>${text}</tool_data>`;
}

async function runTool(tools: readonly ToolImpl[], name: string, args: Json, signal?: AbortSignal): Promise<{ result: Json; isError: boolean }> {
  const tool = tools.find((t) => t.spec.name === name);
  if (!tool) return { result: { error: `unknown tool "${name}"` }, isError: true };
  if (tool.spec.kind !== 'read' && !(tool.spec.kind === 'propose' && tool.toPart)) {
    return { result: { error: `${name} is not available here` }, isError: true };
  }
  try {
    return { result: await tool.run(args, { signal }), isError: false };
  } catch (err) {
    return { result: { error: err instanceof Error ? err.message.slice(0, 200) : 'tool failed' }, isError: true };
  }
}

export async function* runChatTurn(opts: RunTurnOptions): AsyncGenerator<ChatEvent> {
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  const messages: ModelMessage[] = [{ role: 'system', content: opts.system }, ...opts.history, { role: 'user', content: opts.user }];
  const specs = opts.model.supportsTools ? opts.tools.map((t) => t.spec) : [];
  let usage: AiUsage | undefined;
  const end = (finish: RunFinish): ChatEvent => ({ type: 'run_end', finish, usage });

  yield { type: 'run_start', runId: opts.runId };

  for (let step = 0; step < maxSteps; step++) {
    if (opts.signal?.aborted) {
      yield end('cancelled');
      return;
    }
    let text = '';
    const calls: { id: string; name: string; args: Json }[] = [];
    let finished = false;
    let toolCallsFinish = false;

    try {
      for await (const ev of opts.model.stream({ messages, tools: specs, maxTokens: opts.maxTokens, signal: opts.signal })) {
        switch (ev.type) {
          case 'text_delta':
            text += ev.delta;
            yield ev;
            break;
          case 'tool_call_start':
          case 'tool_call_args':
            yield ev;
            break;
          case 'tool_call_end':
            calls.push({ id: ev.id, name: ev.name, args: ev.args });
            yield ev;
            break;
          case 'step_end':
            finished = true;
            toolCallsFinish = ev.finish === 'tool_calls';
            if (ev.usage) usage = addUsage(usage, ev.usage);
            yield { ...ev, step };
            break;
          case 'error':
            yield ev;
            yield end(ev.code === 'cancelled' ? 'cancelled' : 'error');
            return;
          default:
            break; // adapters don't emit run_* / part; ignore if one does
        }
      }
    } catch (err) {
      yield { type: 'error', code: 'error', message: err instanceof Error ? err.message.slice(0, 200) : 'model failed' };
      yield end('error');
      return;
    }

    if (!finished) {
      yield { type: 'error', code: opts.signal?.aborted ? 'cancelled' : 'bad_response', message: 'stream ended early' };
      yield end(opts.signal?.aborted ? 'cancelled' : 'error');
      return;
    }
    if (!toolCallsFinish || !calls.length) {
      yield end('stop');
      return;
    }

    messages.push({
      role: 'assistant',
      content: text || null,
      toolCalls: calls.map((c) => ({ id: c.id, name: c.name, args: JSON.stringify(c.args) })),
    });
    for (const call of calls) {
      if (opts.signal?.aborted) {
        yield end('cancelled');
        return;
      }
      const { result, isError } = await runTool(opts.tools, call.name, call.args, opts.signal);
      yield { type: 'tool_result', callId: call.id, name: call.name, result, isError };
      const impl = isError ? undefined : opts.tools.find((t) => t.spec.name === call.name);
      const card = impl?.spec.kind === 'propose' ? (impl.toPart?.(result) ?? null) : null;
      if (card) yield { type: 'part', part: card };
      messages.push({ role: 'tool', toolCallId: call.id, content: fenceToolResult(result) });
    }
  }

  yield {
    type: 'part',
    part: { type: 'notice', level: 'info', code: 'step_cap', text: 'I looked at a lot for this one. Ask me to keep going for more.' },
  };
  yield end('step_cap');
}
