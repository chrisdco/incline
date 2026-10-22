/**
 * Accent-aware palettes for the widgets. Kept apart from the pure snapshot
 * builders so those never drag the settings store (and SQLite) into tests or
 * the widget bundle.
 */
import type { AccentTheme } from '@/lib/accent-themes';
import { themeHex, type ThemeScheme } from '@/lib/theme';

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
