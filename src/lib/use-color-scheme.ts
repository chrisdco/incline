import { useColorScheme as useRNColorScheme } from 'react-native';

import { isAuroraAccent } from '@/lib/accent-themes';
import { useSettings } from '@/store/settings-store';

export { useRNColorScheme as useSystemColorScheme };

/**
 * Effective color scheme honoring the user's theme preference.
 * Falls back to the system scheme when set to "system".
 */
export function useAppColorScheme(): 'light' | 'dark' {
  const system = useRNColorScheme() ?? 'light';
  const { themeMode } = useSettings();
  if (themeMode === 'system') return system === 'dark' ? 'dark' : 'light';
  return themeMode;
}

/** Whether the effective theme is dark. Convenience for layout wrappers. */
export function useIsDark(): boolean {
  return useAppColorScheme() === 'dark';
}

/** True when an aurora skin (rose/electron) drives the full theme treatment. */
export function useAuroraSkin(): boolean {
  const { accentTheme } = useSettings();
  return isAuroraAccent(accentTheme);
}
