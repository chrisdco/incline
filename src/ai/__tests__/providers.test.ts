import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: async (_algo: string, value: string) =>
    createHash('sha256').update(value, 'utf8').digest('hex'),
}));

import { COACHING_RULE_VERSION } from '@/coaching/types';
import { buildFeaturePackV1 } from '@/coaching/feature-pack';
import { createChatProvider } from '../providers/chat';
import { createGatewayProvider } from '../providers/gateway';
import { runAiTask } from '../router';
import { narrateTask, type NarrateInput } from '../tasks/narrate';
import { AiError } from '../types';

function chatReply(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

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

describe('chat provider (BYOK / local)', () => {
  it('sends the task messages with the key and parses fenced JSON', async () => {
    const fetchImpl = vi.fn(async () =>
      chatReply('```json\n{"headline":"Up 12%","paragraphs":["Volume +12% vs last week."],"citedInsightIds":["volume-trend"]}\n```'),
    );
    const p = createChatProvider({
      id: 'byok',
      baseUrl: 'https://api.example.com/v1/',
      model: 'm',
      getApiKey: async () => 'sk-test',
      reasoningEffort: 'low',
      fetchImpl,
    });
    const result = await runAiTask(narrateTask, input, { providers: [p] });
    expect(result).toMatchObject({ status: 'ok', providerId: 'byok', output: { headline: 'Up 12%' } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: 'm', reasoning_effort: 'low', response_format: { type: 'json_object' } });
    expect(body.messages[0].content).toContain('Never invent numbers');
  });

  it('sends json_schema only when the host constrains decoding', async () => {
    const bodyFor = async (strictSchema: boolean) => {
      const fetchImpl = vi.fn(async () => chatReply('{"headline":"Up","paragraphs":["Volume +12% vs last week."]}'));
      await createChatProvider({ id: 'c', baseUrl: 'https://x/v1', model: 'm', strictSchema, fetchImpl }).run(narrateTask, input, {});
      return JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    };
    expect((await bodyFor(true)).response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'narrate', strict: true, schema: { required: ['headline', 'paragraphs', 'citedInsightIds'] } },
    });
    expect((await bodyFor(false)).response_format).toEqual({ type: 'json_object' });
  });

  it('is unavailable without a key', async () => {
    const p = createChatProvider({ id: 'byok', baseUrl: 'https://x/v1', model: 'm', getApiKey: async () => null });
    expect(await p.isAvailable()).toBe(false);
  });

  it('maps HTTP and network failures to router failures', async () => {
    const run = (fetchImpl: typeof fetch) =>
      createChatProvider({ id: 'c', baseUrl: 'https://x/v1', model: 'm', fetchImpl })
        .run(narrateTask, input, {})
        .catch((e: AiError) => e.kind);
    expect(await run(async () => new Response('slow down', { status: 429 }))).toBe('rate_limited');
    expect(await run(async () => new Response('nope', { status: 401 }))).toBe('unavailable');
    expect(await run(async () => new Response('oops', { status: 500 }))).toBe('error');
    expect(
      await run(async () => {
        throw new TypeError('Network request failed');
      }),
    ).toBe('offline');
    expect(await run(async () => chatReply('sorry, I cannot do that'))).toBe('invalid_output');
  });

  it('rejects invented numbers, repairs once, then falls back to rules copy (null)', async () => {
    const fetchImpl = vi.fn(async () =>
      chatReply('{"headline":"Up 40%","paragraphs":["Volume +40%."],"citedInsightIds":[]}'),
    );
    const p = createChatProvider({ id: 'byok', baseUrl: 'https://x/v1', model: 'm', fetchImpl });
    const result = await runAiTask(narrateTask, input, { providers: [p] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(repairBody.messages.at(-1).content).toMatch(/rejected: .*number/);
    expect(result).toMatchObject({ status: 'fallback', reason: 'invalid_output', output: null });
  });
});

describe('gateway provider', () => {
  it('posts the narrate body with the Clerk token and picks the narration', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          narration: { headline: 'Climbing', paragraphs: ['Volume +12% vs last week.'], citedInsightIds: ['volume-trend'] },
        }),
      ),
    );
    const p = createGatewayProvider({
      supabaseUrl: 'https://proj.supabase.co',
      anonKey: 'anon',
      getToken: async () => 'jwt',
      fetchImpl,
    });
    const result = await runAiTask(narrateTask, input, { providers: [p] });
    expect(result).toMatchObject({ status: 'ok', providerId: 'gateway' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://proj.supabase.co/functions/v1/coach-narrate');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ surface: 'home', promptVersion: narrateTask.promptVersion });
    expect(body.packHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('signed out → unavailable; ok:false → invalid_output; never retried', async () => {
    const signedOut = createGatewayProvider({ supabaseUrl: 'https://p', anonKey: 'a', getToken: async () => null });
    await expect(signedOut.run(narrateTask, input, {})).rejects.toMatchObject({ kind: 'unavailable' });

    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'stub_invalid' })));
    const p = createGatewayProvider({ supabaseUrl: 'https://p', anonKey: 'a', getToken: async () => 't', fetchImpl });
    const result = await runAiTask(narrateTask, input, { providers: [p] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'fallback', reason: 'invalid_output' });
  });

  it('unconfigured backend is unavailable', async () => {
    const p = createGatewayProvider({ supabaseUrl: 'your_supabase_url', anonKey: 'a', getToken: async () => 't' });
    expect(await p.isAvailable()).toBe(false);
  });
});

describe('testAiConnection', () => {
  it('passes when the model clears the narration gate, and explains failures', async () => {
    const { testAiConnection } = await import('../connection-test');
    const config = { presetId: 'groq' as const, baseUrl: 'https://x/v1', model: 'm' };
    const good = await testAiConnection(config, async () => 'k', async () =>
      chatReply('{"headline":"3 weeks strong","paragraphs":["Every week for 3 weeks."],"citedInsightIds":["streak"]}'),
    );
    expect(good).toMatchObject({ ok: true, headline: '3 weeks strong' });

    const noKey = await testAiConnection(config, async () => null, async () => chatReply('{}'));
    expect(noKey).toMatchObject({ ok: false, reason: 'unavailable' });

    const badKey = await testAiConnection(config, async () => 'k', async () => new Response('bad key', { status: 401 }));
    expect(badKey).toMatchObject({ ok: false, reason: 'unavailable' });
  });
});

describe('server address checks', () => {
  it('accepts http(s) hosts with optional port and path', async () => {
    const { isValidServerUrl } = await import('../byok-presets');
    expect(isValidServerUrl('http://192.168.1.10:11434/v1')).toBe(true);
    expect(isValidServerUrl('https://ollama.example.com/v1')).toBe(true);
    expect(isValidServerUrl('192.168.1.10:11434')).toBe(false);
    expect(isValidServerUrl('http://')).toBe(false);
    expect(isValidServerUrl('ftp://x')).toBe(false);
  });

  it('flags cleartext LAN addresses but not loopback or https', async () => {
    const { isCleartextLan } = await import('../byok-presets');
    expect(isCleartextLan('http://192.168.1.10:11434/v1')).toBe(true);
    expect(isCleartextLan('http://localhost:11434/v1')).toBe(false);
    expect(isCleartextLan('https://192.168.1.10/v1')).toBe(false);
  });
});
