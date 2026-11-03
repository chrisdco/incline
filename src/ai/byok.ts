import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '@/db/kv';

/**
 * Bring-your-own-key / local model settings. Device-local by design: the
 * endpoint + model live in kv (never synced), the key lives in the OS keystore
 * (expo-secure-store) and is only read at call time.
 */

export interface ByokConfig {
  presetId: ByokPresetId;
  baseUrl: string;
  model: string;
  /** Omitted for providers that don't support it. */
  reasoningEffort?: string;
}

export type ByokPresetId = 'groq' | 'openrouter' | 'gemini' | 'openai' | 'local';

export interface ByokPreset {
  id: ByokPresetId;
  label: string;
  baseUrl: string;
  defaultModel: string;
  needsKey: boolean;
  reasoningEffort?: string;
  /** Host constrains decoding to a JSON schema (see providers/chat.ts). */
  strictSchema?: boolean;
  /** Where to get a key; shown in settings. */
  keyUrl?: string;
}

/** Defaults scored in evals/ (README results log). Users can override the model. */
export const BYOK_PRESETS: readonly ByokPreset[] = [
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-20b',
    needsKey: true,
    reasoningEffort: 'low',
    keyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-oss-20b:free',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-flash-lite-latest',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    needsKey: true,
    strictSchema: true,
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'local',
    label: 'Local (Ollama / LM Studio)',
    baseUrl: 'http://192.168.1.10:11434/v1',
    defaultModel: 'qwen3:4b',
    needsKey: false,
    reasoningEffort: 'none',
    strictSchema: true,
  },
];

export function byokPreset(id: ByokPresetId): ByokPreset {
  return BYOK_PRESETS.find((p) => p.id === id) ?? BYOK_PRESETS[0];
}

const KEY_STORE_KEY = 'incline.ai.byok.key';

export async function getByokKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY_STORE_KEY);
  } catch {
    return null;
  }
}

export async function setByokKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_STORE_KEY, key.trim());
}

export async function clearByokKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_STORE_KEY);
  } catch {
    // Nothing stored.
  }
}

interface AiSettingsState {
  /** null = use Incline cloud only. */
  byok: ByokConfig | null;
  setByok: (config: ByokConfig | null) => void;
}

function isByokConfig(v: unknown): v is ByokConfig {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.baseUrl === 'string' &&
    typeof c.model === 'string' &&
    BYOK_PRESETS.some((p) => p.id === c.presetId) &&
    (c.reasoningEffort === undefined || typeof c.reasoningEffort === 'string')
  );
}

export const useAiSettings = create<AiSettingsState>()(
  persist(
    (set) => ({
      byok: null,
      setByok: (byok) => set({ byok }),
    }),
    {
      name: 'ai.settings',
      storage: createJSONStorage(() => kvStorage),
      partialize: (s) => ({ byok: s.byok }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { byok?: unknown };
        return { ...current, byok: isByokConfig(p.byok) ? p.byok : null };
      },
    },
  ),
);
