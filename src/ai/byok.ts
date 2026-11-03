import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { kvStorage } from '@/db/kv';

/**
 * Bring-your-own-key / local model settings. Device-local by design: the
 * endpoint + model live in kv (never synced), the key lives in the OS keystore
 * (expo-secure-store) and is only read at call time.
 */

export { BYOK_PRESETS, byokPreset, type ByokConfig, type ByokPreset, type ByokPresetId } from './byok-presets';
import { BYOK_PRESETS, type ByokConfig } from './byok-presets';

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

/**
 * Forget the user's own key and provider. Account switch and account
 * deletion call this: the next account must never spend this one's key.
 */
export async function resetAiSettings(): Promise<void> {
  useAiSettings.getState().setByok(null);
  await clearByokKey();
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
