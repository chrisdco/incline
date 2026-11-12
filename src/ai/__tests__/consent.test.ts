import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/kv', () => ({ kvStorage: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } }));
vi.mock('expo-secure-store', () => ({}));

import { buildProviderChain, chainBlockedByConsent, type ChainInputs } from '../chain';
import { AI_CONSENT_VERSION, hasAnyConsent, hasConsent, type AiConsentState } from '../consent';

const grant = { version: AI_CONSENT_VERSION, at: '2026-11-12T00:00:00Z' };
const none: AiConsentState = { incline: null, byok: {} };
const gateway = { supabaseUrl: 'https://x.supabase.co', anonKey: 'anon', getToken: async () => 't' };
const byok = { presetId: 'groq' as const, baseUrl: 'https://api.groq.com/openai/v1', model: 'm' };

function inputs(over: Partial<ChainInputs>): ChainInputs {
  return { byok: null, getByokKey: async () => 'k', gateway: null, consent: none, ...over };
}

describe('AI consent (5.1.2(i))', () => {
  it('drops every third-party provider without consent', () => {
    const i = inputs({ byok, gateway });
    expect(buildProviderChain(i)).toHaveLength(0);
    expect(chainBlockedByConsent(i)).toBe(true);
  });

  it('consent is per provider', () => {
    const i = inputs({ byok, gateway, consent: { incline: grant, byok: {} } });
    expect(buildProviderChain(i).map((p) => p.id)).toEqual(['gateway']);
    const j = inputs({ byok, gateway, consent: { incline: null, byok: { groq: grant } } });
    expect(buildProviderChain(j).map((p) => p.id)).toEqual(['byok:groq']);
  });

  it('a new provider asks again; an old version asks again', () => {
    const s: AiConsentState = { incline: { ...grant, version: AI_CONSENT_VERSION - 1 }, byok: { openrouter: grant } };
    expect(hasConsent(s, { kind: 'incline' })).toBe(false);
    expect(hasConsent(s, { kind: 'byok', presetId: 'groq' })).toBe(false);
    expect(hasAnyConsent(s)).toBe(true);
  });

  it("the user's own local server is not third-party AI", () => {
    expect(hasConsent(none, { kind: 'byok', presetId: 'local' })).toBe(true);
  });

  it('an empty chain with nothing configured is not a consent problem', () => {
    expect(chainBlockedByConsent(inputs({}))).toBe(false);
  });
});
