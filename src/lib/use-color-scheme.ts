import { useEffect } from 'react';
import { Appearance, useColorScheme as useRNColorScheme } from 'react-native';

import { isAuroraAccent } from '@/lib/accent-themes';
import { useSettings } from '@/store/settings-store';

export { useRNColorScheme as useSystemColorScheme };

/**
 * Effective color scheme honoring the user's theme preference.
 * Falls back to the system scheme when set to "system".
 */
export function useAppColorScheme(): 'light' | 'dark' {
  const system = useRNColorScheme() ?? 'light';
  const themeMode = useSettings((s) => s.themeMode);
  if (themeMode === 'system') return system === 'dark' ? 'dark' : 'light';
  return themeMode;
}

/**
 * Hand the in-app theme choice to the native side. Native views (the
 * `@expo/ui` Material sheets, system dialogs, pickers) theme from the OS
 * night mode, not our `dark` class, so an app set to Dark on a light phone
 * drew light sheets with light text. 'auto' clears the override for
 * "system". Mount once, at the root.
 */
export function useSyncNativeColorScheme(): void {
  const themeMode = useSettings((s) => s.themeMode);
  useEffect(() => {
    Appearance.setColorScheme(themeMode === 'system' ? 'auto' : themeMode);
  }, [themeMode]);
}

/** Whether the effective theme is dark. Convenience for layout wrappers. */
export function useIsDark(): boolean {
  return useAppColorScheme() === 'dark';
}

/** True when an aurora skin (rose/electron) drives the full theme treatment. */
export function useAuroraSkin(): boolean {
  const accentTheme = useSettings((s) => s.accentTheme);
  return isAuroraAccent(accentTheme);
}
