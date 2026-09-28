/**
 * Accent / brand themes. Primary drives CTAs, tabs, focus rings.
 * Success stays emerald across themes so "set complete" stays familiar.
 *
 * Apply CSS via `theme-${id}` on the root View (see global.css) —
 * NativeWind resolves tokens from those classes, not RN style objects.
 * Hex maps stay in sync for charts, ActivityIndicator, icons.
 */

import type { AccentTheme } from '@/db/types';

export type { AccentTheme };

/** Dark ink on light accents, light ink on dark accents — from HSL lightness. */
export function primaryForegroundChannels(hsl: string): string {
  const match = hsl.match(/([\d.]+)%\s*$/);
  const lightness = match ? Number(match[1]) : 50;
  return lightness >= 55 ? '240 10% 4%' : '0 0% 100%';
}

/** Shared supporting hues that sit alongside each accent without clashing. */
const CHART_SUPPORT = {
  light: ['#F59E0B', '#A78BFA', '#F87171', '#64748B', '#0F766E'],
  dark: ['#FBBF24', '#C4B5FD', '#FB7185', '#94A3B8', '#2DD4BF'],
} as const;

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

export const ACCENT_THEMES: Record<AccentTheme, AccentDefinition> = {
  indigo: {
    id: 'indigo',
    label: 'Indigo',
    description: 'Electric indigo — default Incline brand',
    light: { primary: '246 90% 66%', ring: '246 90% 66%', chart1: '246 80% 60%' },
    dark: { primary: '246 85% 72%', ring: '246 85% 72%', chart1: '246 75% 68%' },
    hex: { light: '#6D5DF6', dark: '#8B7CFF' },
  },
  teal: {
    id: 'teal',
    label: 'Teal',
    description: 'Athletic teal without gym-green cliché',
    light: { primary: '173 80% 32%', ring: '173 80% 32%', chart1: '173 70% 38%' },
    dark: { primary: '172 66% 50%', ring: '172 66% 50%', chart1: '172 60% 52%' },
    hex: { light: '#0D9488', dark: '#2DD4BF' },
  },
  copper: {
    id: 'copper',
    label: 'Copper',
    description: 'Warm energy on cool neutrals',
    light: { primary: '32 80% 57%', ring: '32 80% 57%', chart1: '32 75% 52%' },
    dark: { primary: '32 85% 62%', ring: '32 85% 62%', chart1: '32 80% 58%' },
    hex: { light: '#E8943A', dark: '#F0A85A' },
  },
  coral: {
    id: 'coral',
    label: 'Coral',
    description: 'High-energy accent (distinct from destructive)',
    light: { primary: '0 100% 68%', ring: '0 100% 68%', chart1: '0 85% 62%' },
    dark: { primary: '0 90% 72%', ring: '0 90% 72%', chart1: '0 80% 68%' },
    hex: { light: '#FF6B6B', dark: '#FF8585' },
  },
  emerald: {
    id: 'emerald',
    label: 'Emerald',
    description: 'Classic fitness green (for comparison)',
    light: { primary: '142 69% 45%', ring: '142 69% 45%', chart1: '142 64% 45%' },
    dark: { primary: '142 69% 47%', ring: '142 69% 47%', chart1: '142 64% 48%' },
    hex: { light: '#16a34a', dark: '#22c55e' },
  },
  mint: {
    id: 'mint',
    label: 'Mint',
    description: 'Soft seafoam — charts and active states',
    light: { primary: '142 68% 48%', ring: '142 68% 48%', chart1: '142 62% 46%' },
    dark: { primary: '142 70% 68%', ring: '142 70% 68%', chart1: '142 65% 62%' },
    hex: { light: '#2DB86A', dark: '#75E69C' },
  },
  rose: {
    id: 'rose',
    label: 'Rose',
    description: 'Hot pink aurora — neon dark skin',
    light: { primary: '336 80% 50%', ring: '336 80% 50%', chart1: '336 75% 55%' },
    dark: { primary: '331 85% 68%', ring: '331 85% 68%', chart1: '331 80% 62%' },
    hex: { light: '#DB3A7B', dark: '#F368AB' },
  },
  electron: {
    id: 'electron',
    label: 'Electron',
    description: 'Electric cyan aurora — neon dark skin',
    light: { primary: '187 85% 36%', ring: '187 85% 36%', chart1: '187 80% 44%' },
    dark: { primary: '193 90% 60%', ring: '193 90% 60%', chart1: '193 85% 56%' },
    hex: { light: '#0B8A9E', dark: '#3DCDF5' },
  },
};

export const ACCENT_THEME_LIST = Object.values(ACCENT_THEMES);

export const DEFAULT_ACCENT_THEME: AccentTheme = 'teal';

export function isAccentTheme(value: unknown): value is AccentTheme {
  return typeof value === 'string' && value in ACCENT_THEMES;
}

/** Full aurora skins (tinted dark base + ambient glow). Everything else is Classic. */
export function isAuroraAccent(value: unknown): value is AccentTheme {
  return value === 'rose' || value === 'electron';
}

/** Base accents shown in the Classic accent picker (aurora skins have their own picker entry). */
export const CLASSIC_ACCENTS = ACCENT_THEME_LIST.filter((t) => !isAuroraAccent(t.id));

/** Chart palette keyed to the active accent: accent + amber/mauve/red/slate/teal. */
export function chartPaletteFor(
  accent: AccentTheme = DEFAULT_ACCENT_THEME,
  scheme: 'light' | 'dark' = 'dark',
): string[] {
  const def = ACCENT_THEMES[accent] ?? ACCENT_THEMES[DEFAULT_ACCENT_THEME];
  const support = CHART_SUPPORT[scheme];
  return [def.hex[scheme], ...support];
}
