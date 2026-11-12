import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { AI_CONSENT_VERSION } from '@/contracts/ai/consent';
import { kvStorage } from '@/db/kv';

import type { ByokPresetId } from './byok-presets';

/**
 * Consent to send personal data to third-party AI (App Store 5.1.2(i);
 * FOUNDATION-REVIEW G1). Per provider, off by default, versioned: bump
 * `AI_CONSENT_VERSION` when the processors or what we send changes, and every
 * device asks again. `buildProviderChain` drops any provider without consent,
 * so no code path can reach a third-party model without it. On-device models
 * (expo-ai) will not need it.
 *
 * Device-local like BYOK settings; cleared on account switch (resetAiSettings).
 */
export { AI_CONSENT_VERSION };

/** Who processes Incline-hosted AI requests. Shown verbatim on the consent screen. */
export const INCLINE_AI_PROCESSORS = ['Groq', 'OpenRouter'] as const;
export const INCLINE_AI_ROUTER = 'Cloudflare AI Gateway';

export interface ConsentGrant {
  version: number;
  at: string;
}

export interface AiConsentState {
  incline: ConsentGrant | null;
  /** Keyed by BYOK preset: consent names the provider, so a new provider asks again. */
  byok: Partial<Record<ByokPresetId, ConsentGrant>>;
}

export type ConsentTarget = { kind: 'incline' } | { kind: 'byok'; presetId: ByokPresetId };

const current = (g: ConsentGrant | null | undefined): boolean => Boolean(g && g.version >= AI_CONSENT_VERSION);

/** Presets that run on the user's own machine are not third-party AI. */
const SELF_HOSTED: readonly ByokPresetId[] = ['local'];

export function hasConsent(state: AiConsentState, target: ConsentTarget): boolean {
  if (target.kind === 'byok' && SELF_HOSTED.includes(target.presetId)) return true;
  return target.kind === 'incline' ? current(state.incline) : current(state.byok[target.presetId]);
}

export function hasAnyConsent(state: AiConsentState): boolean {
  return current(state.incline) || Object.values(state.byok).some(current);
}

const grant = (): ConsentGrant => ({ version: AI_CONSENT_VERSION, at: new Date().toISOString() });

interface ConsentStore extends AiConsentState {
  set: (target: ConsentTarget, allowed: boolean) => void;
  clear: () => void;
}

const EMPTY: AiConsentState = { incline: null, byok: {} };

function isGrant(v: unknown): v is ConsentGrant {
  return Boolean(v && typeof v === 'object' && typeof (v as ConsentGrant).version === 'number' && typeof (v as ConsentGrant).at === 'string');
}

export const useAiConsent = create<ConsentStore>()(
  persist(
    (set) => ({
      ...EMPTY,
      set: (target, allowed) =>
        set((s) =>
          target.kind === 'incline'
            ? { incline: allowed ? grant() : null }
            : { byok: { ...s.byok, [target.presetId]: allowed ? grant() : undefined } },
        ),
      clear: () => set(EMPTY),
    }),
    {
      name: 'ai.consent',
      storage: createJSONStorage(() => kvStorage),
      partialize: (s) => ({ incline: s.incline, byok: s.byok }),
      merge: (persisted, cur) => {
        const p = (persisted ?? {}) as { incline?: unknown; byok?: unknown };
        const byok: AiConsentState['byok'] = {};
        if (p.byok && typeof p.byok === 'object') {
          for (const [k, v] of Object.entries(p.byok)) if (isGrant(v)) byok[k as ByokPresetId] = v;
        }
        return { ...cur, incline: isGrant(p.incline) ? p.incline : null, byok };
      },
    },
  ),
);

/** Snapshot for non-React callers (task clients). */
export function readAiConsent(): AiConsentState {
  const { incline, byok } = useAiConsent.getState();
  return { incline, byok };
}
