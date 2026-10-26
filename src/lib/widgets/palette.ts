/**
 * Accent-aware palettes for the widgets. Reads `src/styles/tokens.ts` (the
 * same source as `themeHex` in lib/theme) directly, so neither the snapshot
 * builders nor the widget bundle drag the settings store (and SQLite) in.
 */
import { themeHex, type AccentTheme, type Scheme as ThemeScheme } from '@/styles/tokens';

import type { WidgetPalette, WidgetPalettes } from './types';

export function widgetPalette(scheme: ThemeScheme, accent: AccentTheme): WidgetPalette {
  const hex = themeHex(scheme, accent);
  return {
    background: hex.background,
    card: hex.card,
    foreground: hex.foreground,
    muted: hex.mutedForeground,
    primary: hex.primary,
    border: hex.border,
  };
}

/** Both schemes up front — the widget picks by `environment.colorScheme`. */
export function widgetPalettes(accent: AccentTheme): WidgetPalettes {
  return { light: widgetPalette('light', accent), dark: widgetPalette('dark', accent) };
}
