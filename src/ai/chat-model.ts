import type { ModelPort } from '@/contracts/ai/chat';
import { AI_CONSENT_HEADER, AI_CONSENT_VERSION } from '@/contracts/ai/consent';

import { byokPreset } from './byok-presets';
import type { ChainInputs } from './chain';
import { hasConsent } from './consent';
import { createOpenAiCompatModel } from './runtime/adapters/openai-compat';

/**
 * Which model answers Ask (AI-CHAT §3.3), in the same order and under the
 * same consent rules as the task chain: the user's own key first, then the
 * Incline `ai-chat` gateway. Chat streams, so it doesn't fall back between
 * providers mid-answer; the first usable one is used.
 */
export type ChatModelChoice = { ok: true; model: ModelPort } | { ok: false; reason: 'consent' | 'unavailable' };

/** The gateway picks the real model (G8 catalog) and reports it in usage. */
export const GATEWAY_CHAT_MODEL = 'incline-chat';

export function chooseChatModel(inputs: ChainInputs): ChatModelChoice {
  const fetchImpl = inputs.fetchImpl;
  if (inputs.byok && hasConsent(inputs.consent, { kind: 'byok', presetId: inputs.byok.presetId })) {
    const preset = byokPreset(inputs.byok.presetId);
    const { getByokKey } = inputs;
    return {
      ok: true,
      model: createOpenAiCompatModel({
        id: `byok:${preset.id}:${inputs.byok.model}`,
        providerId: `byok:${preset.id}`,
        url: `${inputs.byok.baseUrl.replace(/\/$/, '')}/chat/completions`,
        model: inputs.byok.model,
        headers: async () => {
          const key = preset.needsKey ? await getByokKey() : null;
          const h: Record<string, string> = {};
          if (key) h.Authorization = `Bearer ${key}`;
          return h;
        },
        extraBody: inputs.byok.reasoningEffort ? { reasoning_effort: inputs.byok.reasoningEffort } : undefined,
        fetchImpl,
      }),
    };
  }
  if (inputs.gateway && hasConsent(inputs.consent, { kind: 'incline' })) {
    const { supabaseUrl, anonKey, getToken } = inputs.gateway;
    return {
      ok: true,
      model: createOpenAiCompatModel({
        id: 'gateway:chat',
        providerId: 'gateway',
        url: `${supabaseUrl.replace(/\/$/, '')}/functions/v1/ai-chat`,
        model: GATEWAY_CHAT_MODEL,
        headers: async () => {
          const token = await getToken();
          return {
            apikey: anonKey,
            [AI_CONSENT_HEADER]: String(AI_CONSENT_VERSION),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          };
        },
        fetchImpl,
      }),
    };
  }
  const blocked =
    (Boolean(inputs.byok) && !hasConsent(inputs.consent, { kind: 'byok', presetId: inputs.byok!.presetId })) ||
    (Boolean(inputs.gateway) && !hasConsent(inputs.consent, { kind: 'incline' }));
  return { ok: false, reason: blocked ? 'consent' : 'unavailable' };
}
