import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: async (_algo: string, value: string) =>
    createHash('sha256').update(value, 'utf8').digest('hex'),
}));

import { sanitizeNarrationResponse, validateNarrationResponse } from '@/coaching/narrate-validate';
import type { FeaturePackV1 } from '@/coaching/feature-pack';
import { SYSTEM_PROMPT } from '../../supabase/functions/coach-narrate/prompt';
import { validateNarrationResponse as edgeValidate } from '../../supabase/functions/coach-narrate/schema';
import { parseJsonLoose, providerFromEnv, type ChatMessage } from '../lib/provider';
import { summarize, writeReport, type CaseResult } from '../lib/report';
import { NARRATE_FIXTURES } from './fixtures';

const MIN_PASS = Number(process.env.EVAL_MIN_PASS ?? '0.9');

/** Deterministic stand-in so the harness itself can be smoke-tested offline. */
function stubResponder(messages: ChatMessage[]): string {
  const pack = JSON.parse(messages[messages.length - 1].content) as FeaturePackV1;
  const first = pack.insights[0];
  if (first) {
    return JSON.stringify({
      headline: first.title.slice(0, 80),
      paragraphs: [first.body],
      citedInsightIds: [first.id],
    });
  }
  return JSON.stringify({ headline: 'Nice work', paragraphs: ['Keep showing up.'], citedInsightIds: [] });
}

const provider = providerFromEnv(stubResponder);

describe.skipIf(!provider)('narrate eval', () => {
  it(`passes ≥ ${MIN_PASS * 100}% of fixtures`, async () => {
    const results: CaseResult[] = [];
    for (const { id, pack } of NARRATE_FIXTURES) {
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(pack) },
      ];
      let completion;
      try {
        completion = await provider!.complete(messages, { json: true, temperature: 0.4 });
      } catch (err) {
        results.push({ id, ok: false, failure: 'http', detail: String(err), latencyMs: 0, promptTokens: null, completionTokens: null });
        continue;
      }
      const base = {
        id,
        latencyMs: completion.latencyMs,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
      };
      const parsed = parseJsonLoose(completion.text);
      if (parsed === undefined) {
        results.push({ ...base, ok: false, failure: 'json', detail: completion.text.slice(0, 300) });
        continue;
      }
      // Same order as production: soft sanitize, then the hard gate.
      const client = validateNarrationResponse(sanitizeNarrationResponse(parsed, pack), pack);
      if (!client.ok) {
        const stage = /number/i.test(client.error) ? 'numbers' : 'schema';
        results.push({ ...base, ok: false, failure: stage, detail: `${client.error} :: ${completion.text.slice(0, 300)}` });
        continue;
      }
      // #189: the edge copy must agree with the client gate.
      const edge = edgeValidate(client.narration, pack);
      if (!edge.ok) {
        results.push({ ...base, ok: false, failure: 'edge_disagrees', detail: edge.error });
        continue;
      }
      results.push({ ...base, ok: true });
    }

    const summary = summarize('narrate', provider!.id, results);
    writeReport(summary, results);
    expect(summary.passRate).toBeGreaterThanOrEqual(MIN_PASS);
  });
});
