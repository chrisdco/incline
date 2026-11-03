import { describe, expect, it, vi } from 'vitest';

import { runAiTask } from '../router';
import { AiError, type AiEvent, type AiProvider, type AiTask, type KvLike } from '../types';

type Out = { text: string };

function task(overrides: Partial<AiTask<string, Out>> = {}): AiTask<string, Out> {
  return {
    id: 't',
    promptVersion: 'v1',
    tier: 'small',
    timeoutMs: 200,
    buildMessages: (input) => [{ role: 'user', content: input }],
    parse: (raw) =>
      raw && typeof (raw as Out).text === 'string' && (raw as Out).text !== 'bad'
        ? { ok: true, output: raw as Out }
        : { ok: false, error: 'missing text' },
    fallback: () => ({ text: 'rules copy' }),
    ...overrides,
  };
}

function provider(id: string, run: AiProvider['run'], extra: Partial<AiProvider> = {}): AiProvider {
  return {
    id,
    repairable: true,
    capabilities: { structuredOutput: true, toolCalling: false, onDevice: false },
    isAvailable: async () => true,
    supports: () => true,
    run,
    ...extra,
  };
}

function memoryKv(): KvLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
}

describe('runAiTask', () => {
  it('returns the first provider that produces valid output', async () => {
    const second = vi.fn(async () => ({ text: 'two' }));
    const result = await runAiTask(task(), 'hi', {
      providers: [provider('a', async () => ({ text: 'one' })), provider('b', second)],
    });
    expect(result).toMatchObject({ status: 'ok', output: { text: 'one' }, providerId: 'a', cached: false });
    expect(second).not.toHaveBeenCalled();
  });

  it('disabled → fallback without calling any provider', async () => {
    const run = vi.fn();
    const result = await runAiTask(task(), 'hi', { enabled: false, providers: [provider('a', run)] });
    expect(result).toMatchObject({ status: 'fallback', reason: 'disabled', output: { text: 'rules copy' } });
    expect(run).not.toHaveBeenCalled();
  });

  it('repairs once with the parse error as a hint, then succeeds', async () => {
    const hints: (string | undefined)[] = [];
    const result = await runAiTask(task(), 'hi', {
      providers: [
        provider('a', async (_t, _i, ctx) => {
          hints.push(ctx.repairHint);
          return hints.length === 1 ? { text: 'bad' } : { text: 'fixed' };
        }),
      ],
    });
    expect(hints).toEqual([undefined, 'missing text']);
    expect(result).toMatchObject({ status: 'ok', output: { text: 'fixed' } });
  });

  it('does not repair on a non-repairable provider; falls through to the next', async () => {
    const run = vi.fn(async () => ({ text: 'bad' }));
    const result = await runAiTask(task(), 'hi', {
      providers: [provider('gw', run, { repairable: false }), provider('b', async () => ({ text: 'b' }))],
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'ok', providerId: 'b' });
  });

  it('times out a slow provider and moves on', async () => {
    const result = await runAiTask(task({ timeoutMs: 20 }), 'hi', {
      providers: [
        provider('slow', (_t, _i, ctx) =>
          new Promise((_, reject) => ctx.signal?.addEventListener('abort', () => reject(new Error('aborted'))))),
        provider('fast', async () => ({ text: 'fast' })),
      ],
    });
    expect(result).toMatchObject({ status: 'ok', providerId: 'fast' });
    if (result.status === 'ok') expect(result.attempts[0]).toMatchObject({ providerId: 'slow', outcome: 'timeout' });
  });

  it('offline skips remaining network providers but still tries on-device', async () => {
    const network = vi.fn(async () => ({ text: 'net' }));
    const result = await runAiTask(task(), 'hi', {
      providers: [
        provider('byok', async () => {
          throw new AiError('offline', 'Network request failed');
        }),
        provider('gateway', network),
        provider('device', async () => ({ text: 'local' }), {
          capabilities: { structuredOutput: true, toolCalling: false, onDevice: true },
        }),
      ],
    });
    expect(network).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'ok', providerId: 'device' });
  });

  it('reports the most actionable reason when everything fails', async () => {
    const result = await runAiTask(task(), 'hi', {
      providers: [
        provider('a', async () => {
          throw new AiError('unavailable', 'no key');
        }),
        provider('b', async () => {
          throw new AiError('rate_limited', '429');
        }),
      ],
    });
    expect(result).toMatchObject({ status: 'fallback', reason: 'rate_limited', output: { text: 'rules copy' } });
  });

  it('skips providers that cannot serve the task (capabilities, support, availability)', async () => {
    const run = vi.fn(async () => ({ text: 'x' }));
    const result = await runAiTask(task({ needs: { toolCalling: true } }), 'hi', {
      providers: [provider('noTools', run), provider('unsupported', run, { supports: () => false })],
    });
    expect(run).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'fallback', reason: 'unavailable' });
  });

  it('caches valid output and serves it without a provider call', async () => {
    const kv = memoryKv();
    const run = vi.fn(async () => ({ text: 'fresh' }));
    const t = task({ cacheKey: (input) => input });
    await runAiTask(t, 'k1', { providers: [provider('a', run)], cache: kv });
    const again = await runAiTask(t, 'k1', { providers: [provider('a', run)], cache: kv });
    expect(run).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ status: 'ok', cached: true, output: { text: 'fresh' } });
    expect([...kv.data.keys()]).toEqual(['ai.cache.t.v1.k1']);
  });

  it('dedupes identical in-flight requests', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const run = vi.fn(async () => {
      await gate;
      return { text: 'once' };
    });
    const t = task({ cacheKey: () => 'same', timeoutMs: 1000 });
    const a = runAiTask(t, 'x', { providers: [provider('a', run)] });
    const b = runAiTask(t, 'x', { providers: [provider('a', run)] });
    release();
    expect((await a).status).toBe('ok');
    expect((await b).status).toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('cancel stops the chain and says cancelled', async () => {
    const controller = new AbortController();
    const second = vi.fn(async () => ({ text: 'b' }));
    const result = await runAiTask(task({ timeoutMs: 1000 }), 'hi', {
      signal: controller.signal,
      providers: [
        provider('a', (_t, _i, ctx) =>
          new Promise((_, reject) => {
            ctx.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            controller.abort();
          })),
        provider('b', second),
      ],
    });
    expect(second).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'fallback', reason: 'cancelled' });
  });

  it('emits metadata-only telemetry and survives a throwing fallback / listener', async () => {
    const events: AiEvent[] = [];
    const result = await runAiTask(
      task({
        fallback: () => {
          throw new Error('boom');
        },
      }),
      'secret user text',
      {
        providers: [],
        onEvent: (e) => {
          events.push(e);
          throw new Error('listener bug');
        },
      },
    );
    expect(result).toMatchObject({ status: 'fallback', reason: 'unavailable', output: null });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0])).not.toContain('secret user text');
  });
});
