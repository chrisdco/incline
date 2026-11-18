import { CHAT_MEMORY_TOOLS } from '@/contracts/ai/chat-tools';
import type { Json } from '@/contracts/ai/chat';
import { asMemoryKind } from '@/contracts/ai/memory';
import { saveMemoryFact } from '@/db/queries/memory';

import { ToolInputError, type DeviceTool } from './read-tools';

/**
 * `remember` (AI-CHAT §5): a fact the user asked to keep, saved confirmed
 * (they said it). The thread renders "Saved to memory · Undo" from this
 * tool's result. Memory-off threads don't get the tool at all.
 */
export function deviceMemoryTools(opts: { memoryOff?: boolean } = {}): DeviceTool[] {
  if (opts.memoryOff) return [];
  return CHAT_MEMORY_TOOLS.map((spec) => ({
    spec,
    async run(args) {
      const a = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, Json>) : {};
      const text = typeof a.text === 'string' ? a.text : '';
      if (!text.trim()) throw new ToolInputError('text is required');
      const r = await saveMemoryFact({ kind: asMemoryKind(a.kind), text, source: 'chat', status: 'confirmed' });
      if (r.status === 'full') {
        const full: Json = { saved: false, reason: 'Memory is full. Ask the user to remove old facts in Settings → What Incline knows.' };
        return full;
      }
      if (!('fact' in r)) throw new ToolInputError('text is empty');
      const out: Json = { saved: true, already_known: r.status === 'exists', id: r.fact.id, kind: r.fact.kind, text: r.fact.text };
      return out;
    },
  }));
}
