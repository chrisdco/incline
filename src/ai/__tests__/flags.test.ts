import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('@/db/kv', () => ({
  kvStorage: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      store.set(k, v);
    },
  },
}));

import { isFlagDisabled } from '@/contracts/ai/flags';

import { __resetAiFlagsForTests, isAiActorEnabled, isAiTaskEnabled, refreshAiFlags } from '../flags';

function respond(body: unknown, ok = true): typeof fetch {
  return (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
}

const opts = { supabaseUrl: 'https://x.supabase.co', anonKey: 'anon' };

beforeEach(() => {
  store.clear();
  __resetAiFlagsForTests();
});

describe('isFlagDisabled', () => {
  it('matches exact keys and trailing-* prefixes only', () => {
    const off = ['task:narrate', 'actor:mcp:*'];
    expect(isFlagDisabled(off, 'task:narrate')).toBe(true);
    expect(isFlagDisabled(off, 'task:narrate_v2')).toBe(false);
    expect(isFlagDisabled(off, 'actor:mcp:claude')).toBe(true);
    expect(isFlagDisabled(off, 'actor:app_ai')).toBe(false);
  });
});

describe('AI flags', () => {
  it('everything is enabled with no flags cached', async () => {
    expect(await isAiTaskEnabled('narrate')).toBe(true);
    expect(await isAiActorEnabled('mcp:claude')).toBe(true);
  });

  it('a refresh applies immediately and is cached for the next open', async () => {
    const fetchImpl = vi.fn(respond([{ key: 'task:narrate' }, { key: 'actor:mcp:*' }]));
    expect(await refreshAiFlags({ ...opts, fetchImpl })).toBe(true);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://x.supabase.co/rest/v1/ai_flags?select=key&disabled=eq.true');
    expect(await isAiTaskEnabled('narrate')).toBe(false);
    expect(await isAiActorEnabled('mcp:hermes')).toBe(false);

    __resetAiFlagsForTests();
    expect(await isAiTaskEnabled('narrate')).toBe(false);
  });

  it('a failed or malformed refresh keeps the last known set', async () => {
    await refreshAiFlags({ ...opts, fetchImpl: respond([{ key: 'task:narrate' }]) });
    expect(await refreshAiFlags({ ...opts, fetchImpl: respond(null, false) })).toBe(false);
    expect(await refreshAiFlags({ ...opts, fetchImpl: respond({ nope: 1 }) })).toBe(false);
    const thrower = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await refreshAiFlags({ ...opts, fetchImpl: thrower })).toBe(false);
    expect(await isAiTaskEnabled('narrate')).toBe(false);
  });

  it('skips the fetch without a configured backend', async () => {
    const fetchImpl = vi.fn(respond([]));
    expect(await refreshAiFlags({ supabaseUrl: '', anonKey: '', fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
