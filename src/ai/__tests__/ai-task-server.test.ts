/**
 * The ai-task edge function's task table, run under Node: the body the app's
 * gateway provider sends must pass the server's input gate (including the
 * pack hash, expo-crypto on the app vs WebCrypto on the server), and model
 * output goes through the same hard gate as on the device.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: async (_algo: string, value: string) =>
    createHash('sha256').update(value, 'utf8').digest('hex'),
}));

import { buildFeaturePackV1 } from '@/coaching/feature-pack';
import { COACHING_RULE_VERSION } from '@/coaching/types';

import { TASKS } from '../../../supabase/functions/ai-task/tasks';
import { narrateTask, type NarrateInput } from '../tasks/narrate';

const input: NarrateInput = {
  surface: 'home',
  userId: 'user_1',
  pack: buildFeaturePackV1({
    unit: 'metric',
    surface: 'home',
    insights: [
      {
        id: 'volume-trend',
        kind: 'volume_trend',
        severity: 'success',
        title: 'Volume is climbing',
        body: 'Volume +12% vs last week',
        ruleVersion: COACHING_RULE_VERSION,
      },
    ],
    aggregates: { volumeDeltaPct: 12 },
  }),
};

async function appBody() {
  return (await narrateTask.gateway!.body(input)) as { task: string; promptVersion: string; input: Record<string, unknown> };
}

describe('ai-task server: narrate', () => {
  const server = TASKS.narrate!;

  it('is registered under the id and prompt version the app sends', async () => {
    const body = await appBody();
    expect(TASKS[body.task]).toBe(server);
    expect(body.promptVersion).toBe(server.promptVersion);
  });

  it('accepts the app body, and the server hash matches the app hash', async () => {
    const parsed = await server.parseInput((await appBody()).input);
    expect(parsed.ok).toBe(true);
  });

  it.each([
    ['a tampered hash', (b: Record<string, unknown>) => ({ ...b, packHash: '0'.repeat(64) }), 'pack_hash_mismatch'],
    ['a surface mismatch', (b: Record<string, unknown>) => ({ ...b, surface: 'post_session' }), 'surface_mismatch'],
    ['a bad surface', (b: Record<string, unknown>) => ({ ...b, surface: 'x' }), 'invalid_surface'],
    ['a non-object', () => 'nope', 'input must be an object'],
  ])('rejects %s', async (_label, mutate, error) => {
    const parsed = await server.parseInput(mutate((await appBody()).input));
    expect(parsed).toEqual({ ok: false, error });
  });

  it('gates output exactly like the app: invented numbers fail, rule numbers pass', async () => {
    const parsed = await server.parseInput((await appBody()).input);
    if (!parsed.ok) throw new Error(parsed.error);
    const good = server.parseOutput(
      { headline: 'Volume +12%', paragraphs: ['Volume +12% vs last week.'], citedInsightIds: ['volume-trend'] },
      parsed.value,
    );
    expect(good.ok).toBe(true);
    const invented = server.parseOutput(
      { headline: 'Volume +40%', paragraphs: ['Huge week.'], citedInsightIds: [] },
      parsed.value,
    );
    expect(invented).toMatchObject({ ok: false, error: expect.stringMatching(/number/) });
  });

  it('the stub passes its own gate and the cache key is stable per surface + pack', async () => {
    const parsed = await server.parseInput((await appBody()).input);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(server.parseOutput(server.stub(parsed.value), parsed.value).ok).toBe(true);
    const k1 = await server.cacheKey(parsed.value);
    expect(k1).toMatch(/^home\.[0-9a-f]{64}$/);
    expect(await server.cacheKey(parsed.value)).toBe(k1);
  });

  it('builds the shared prompt', async () => {
    const parsed = await server.parseInput((await appBody()).input);
    if (!parsed.ok) throw new Error(parsed.error);
    const msgs = server.messages(parsed.value);
    expect(msgs.map((m) => m.role)).toEqual(['system', 'user']);
    expect(msgs).toEqual(narrateTask.buildMessages(input));
  });
});
