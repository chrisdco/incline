/**
 * BYOK / local presets and config shape. Pure (no native modules) so the
 * router, chain and connection test stay unit-testable; storage is in byok.ts.
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
