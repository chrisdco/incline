import { buildFeaturePackV1 } from '@/coaching/feature-pack';

import { byokPreset, type ByokConfig } from './byok-presets';
import { createChatProvider } from './providers/chat';
import { runAiTask } from './router';
import { narrateTask } from './tasks/narrate';
import type { AiFailure } from './types';

/**
 * "Test connection" for BYOK / local: runs the real narration task (same
 * prompt, same validator) on a tiny fixed pack, uncached. Passing means the
 * key, endpoint and model all work *and* the model's output clears our gate.
 */
export type ConnectionTestResult =
  | { ok: true; latencyMs: number; headline: string }
  | { ok: false; reason: AiFailure; detail?: string };

const SAMPLE_PACK = buildFeaturePackV1({
  unit: 'metric',
  surface: 'home',
  insights: [
    {
      id: 'streak',
      kind: 'streak',
      severity: 'success',
      title: '3-week streak',
      body: 'You trained every week for 3 weeks',
    },
  ],
  aggregates: { weeklyStreak: 3 },
});

export async function testAiConnection(
  config: ByokConfig,
  getKey: () => Promise<string | null>,
  fetchImpl?: typeof fetch,
): Promise<ConnectionTestResult> {
  const preset = byokPreset(config.presetId);
  const provider = createChatProvider({
    id: `byok:${preset.id}`,
    baseUrl: config.baseUrl,
    model: config.model,
    getApiKey: preset.needsKey ? getKey : undefined,
    reasoningEffort: config.reasoningEffort,
    strictSchema: preset.strictSchema,
    fetchImpl,
  });
  const started = Date.now();
  // A local CPU model can take ~10 s on the first call; be patient here only.
  const task = { ...narrateTask, timeoutMs: preset.id === 'local' ? 45_000 : 15_000, cacheKey: undefined };
  const result = await runAiTask(task, { surface: 'home', pack: SAMPLE_PACK, userId: 'connection-test' }, {
    providers: [provider],
  });
  if (result.status === 'ok') {
    return { ok: true, latencyMs: Date.now() - started, headline: result.output.headline };
  }
  return { ok: false, reason: result.reason, detail: result.attempts.at(-1)?.detail };
}
