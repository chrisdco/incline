import { byokPreset, type ByokConfig } from './byok-presets';
import { hasConsent, type AiConsentState } from './consent';
import { createChatProvider } from './providers/chat';
import { createGatewayProvider } from './providers/gateway';
import type { AiProvider } from './types';

/**
 * Provider order (AI-ARCHITECTURE §4): the user's own key first (their
 * choice, their quota), then the Incline gateway. On-device (expo-ai, SDK 59)
 * will slot in front for small tasks.
 */
export interface ChainInputs {
  byok: ByokConfig | null;
  getByokKey: () => Promise<string | null>;
  /** Present only when the sync backend is configured and signed in. */
  gateway: { supabaseUrl: string; anonKey: string; getToken: () => Promise<string | null> } | null;
  /** Third-party AI consent (FOUNDATION-REVIEW G1). Providers without it are dropped. */
  consent: AiConsentState;
  fetchImpl?: typeof fetch;
}

export function buildProviderChain(inputs: ChainInputs): AiProvider[] {
  const chain: AiProvider[] = [];
  if (inputs.byok && hasConsent(inputs.consent, { kind: 'byok', presetId: inputs.byok.presetId })) {
    const preset = byokPreset(inputs.byok.presetId);
    chain.push(
      createChatProvider({
        id: `byok:${preset.id}`,
        baseUrl: inputs.byok.baseUrl,
        model: inputs.byok.model,
        getApiKey: preset.needsKey ? inputs.getByokKey : undefined,
        reasoningEffort: inputs.byok.reasoningEffort,
        strictSchema: preset.strictSchema,
        fetchImpl: inputs.fetchImpl,
      }),
    );
  }
  if (inputs.gateway && hasConsent(inputs.consent, { kind: 'incline' })) {
    chain.push(createGatewayProvider({ ...inputs.gateway, fetchImpl: inputs.fetchImpl }));
  }
  return chain;
}

/**
 * Why an empty chain is empty: a configured provider that lacks consent gets
 * the consent prompt instead of a generic "can't reach AI".
 */
export function chainBlockedByConsent(inputs: ChainInputs): boolean {
  const byokBlocked = Boolean(inputs.byok) && !hasConsent(inputs.consent, { kind: 'byok', presetId: inputs.byok!.presetId });
  const gatewayBlocked = Boolean(inputs.gateway) && !hasConsent(inputs.consent, { kind: 'incline' });
  return byokBlocked || gatewayBlocked;
}
