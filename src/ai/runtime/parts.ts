import type { ChatEvent, ChatPart } from '@/contracts/ai/chat';

/**
 * Folds streamed ChatEvents into the parts we store and render (our ChatPart
 * v1, never a library format). Pure and incremental: the UI calls it per
 * event for the streaming row; storage saves the final array.
 */
export function applyChatEvent(parts: readonly ChatPart[], ev: ChatEvent): ChatPart[] {
  switch (ev.type) {
    case 'text_delta': {
      const last = parts[parts.length - 1];
      if (last?.type === 'text') return [...parts.slice(0, -1), { type: 'text', text: last.text + ev.delta }];
      return [...parts, { type: 'text', text: ev.delta }];
    }
    case 'tool_call_end':
      return [...parts, { type: 'tool_call', id: ev.id, name: ev.name, args: ev.args }];
    case 'tool_result':
      return [...parts, { type: 'tool_result', callId: ev.callId, name: ev.name, result: ev.result, ...(ev.isError ? { isError: true } : {}) }];
    case 'part':
      return [...parts, ev.part];
    case 'error':
      if (ev.code === 'cancelled') return [...parts];
      return [...parts, { type: 'notice', level: 'error', code: ev.code, text: ev.message }];
    default:
      return parts as ChatPart[];
  }
}

/** Tool calls still waiting on a result: the "Looking at your records…" row. */
export function pendingToolCalls(parts: readonly ChatPart[]): string[] {
  const done = new Set(parts.filter((p) => p.type === 'tool_result').map((p) => (p as { callId: string }).callId));
  return parts.filter((p) => p.type === 'tool_call' && !done.has(p.id)).map((p) => (p as { name: string }).name);
}
