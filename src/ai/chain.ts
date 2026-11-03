import { byokPreset, type ByokConfig } from './byok-presets';
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
  fetchImpl?: typeof fetch;
}

export function buildProviderChain(inputs: ChainInputs): AiProvider[] {
  const chain: AiProvider[] = [];
  if (inputs.byok) {
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
  if (inputs.gateway) {
    chain.push(createGatewayProvider({ ...inputs.gateway, fetchImpl: inputs.fetchImpl }));
  }
  return chain;
}
