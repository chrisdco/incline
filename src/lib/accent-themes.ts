/**
 * Accent / brand themes. Primary drives CTAs, tabs, focus rings.
 * Success stays emerald across themes so "set complete" stays familiar.
 *
 * Values live in `src/styles/tokens.ts` (which also generates the
 * `theme-${id}` classes in global.css). This module is the app-facing view:
 * picker metadata, HSL channels and native hex per accent.
 */

import { ACCENT_TOKENS, CHART_SUPPORT_HEX, DEFAULT_ACCENT, type AccentTheme } from '@/styles/tokens';

export type { AccentTheme };

/** Dark ink on light accents, light ink on dark accents — from HSL lightness. */
export function primaryForegroundChannels(hsl: string): string {
  const match = hsl.match(/([\d.]+)%\s*$/);
  const lightness = match ? Number(match[1]) : 50;
  return lightness >= 55 ? '240 10% 4%' : '0 0% 100%';
}

export interface AccentDefinition {
  id: AccentTheme;
  label: string;
  description: string;
  /** Tailwind-friendly HSL channels without `hsl()` wrapper: "H S% L%" */
  light: { primary: string; ring: string; chart1: string };
  dark: { primary: string; ring: string; chart1: string };
  /** Hex for native props */
  hex: { light: string; dark: string };
}

export const ACCENT_THEMES = Object.fromEntries(
  (Object.keys(ACCENT_TOKENS) as AccentTheme[]).map((id) => {
    const t = ACCENT_TOKENS[id];
    const channels = (scheme: 'light' | 'dark') => ({
      primary: t.vars[scheme].primary,
      ring: t.vars[scheme].ring,
      chart1: t.vars[scheme]['chart-1'],
    });
    const def: AccentDefinition = {
      id,
      label: t.label,
      description: t.description,
      light: channels('light'),
      dark: channels('dark'),
      hex: t.hex,
    };
    return [id, def];
  }),
) as Record<AccentTheme, AccentDefinition>;

export const ACCENT_THEME_LIST = Object.values(ACCENT_THEMES);

export const DEFAULT_ACCENT_THEME: AccentTheme = DEFAULT_ACCENT;

export function isAccentTheme(value: unknown): value is AccentTheme {
  return typeof value === 'string' && value in ACCENT_THEMES;
}

/** Full aurora skins (tinted dark base + ambient glow). Everything else is Classic. */
export function isAuroraAccent(value: unknown): value is AccentTheme {
  return isAccentTheme(value) && ACCENT_TOKENS[value].aurora;
}

/** Base accents shown in the Classic accent picker (aurora skins have their own picker entry). */
export const CLASSIC_ACCENTS = ACCENT_THEME_LIST.filter((t) => !isAuroraAccent(t.id));

/** Chart palette keyed to the active accent: accent + amber/mauve/red/slate/teal. */
export function chartPaletteFor(
  accent: AccentTheme = DEFAULT_ACCENT_THEME,
  scheme: 'light' | 'dark' = 'dark',
): string[] {
  const def = ACCENT_THEMES[accent] ?? ACCENT_THEMES[DEFAULT_ACCENT_THEME];
  const support = CHART_SUPPORT_HEX[scheme];
  return [def.hex[scheme], ...support];
}
