/**
 * Theme tokens — the single source for every color the app paints.
 *
 * Two outputs read from here:
 *  - CSS variables: `src/global.css` (one Uniwind theme per scheme x accent)
 *    and `src/styles/uniwind-themes.json` are GENERATED from these tables by
 *    src/styles/global-css.ts. Edit here, then run `pnpm tokens:css`; a unit
 *    test fails CI when either file is stale.
 *  - Native hex: props that cannot take a className (ActivityIndicator,
 *    charts, nav theme, SystemUI, widgets) go through `themeHex()` below.
 *
 * CSS values are HSL channels without the `hsl()` wrapper ("H S% L%"); the
 * generator wraps them (`hsl(...)`). Native hex values are pinned
 * separately — they predate this module and do NOT all equal the HSL
 * channels (see docs/decisions/TECH-DECISIONS.md, 2026-10-26). Converging
 * them is a visual change and belongs to the polish pass, not here.
 *
 * Pure data + pure functions only: no React, no store, so the widget bundle
 * and tests can import it freely.
 */
import type { AccentTheme } from '@/db/types';

export type { AccentTheme };
export type Scheme = 'light' | 'dark';

/** HSL channels, e.g. "240 10% 3.9%". */
type Channels = string;
type VarMap = Readonly<Record<string, Channels>>;

export const RADIUS = '0.9rem';

/**
 * Neutrals + semantic colors: the plain `light` / `dark` Uniwind themes and
 * the base of every `<scheme>-<accent>` theme. Key order is the emitted CSS
 * order. `primary`/`ring`/`chart-1` here are only the fallback before the
 * root layout's first `Uniwind.setTheme`.
 */
export const BASE_VARS = {
  light: {
    background: '240 20% 98%',
    foreground: '240 10% 3.9%',
    'surface-1': '0 0% 100%',
    'surface-2': '240 4.8% 95.9%',
    card: '0 0% 100%',
    'card-foreground': '240 10% 3.9%',
    popover: '0 0% 100%',
    'popover-foreground': '240 10% 3.9%',
    primary: '173 80% 32%',
    'primary-foreground': '0 0% 100%',
    secondary: '240 4.8% 95.9%',
    'secondary-foreground': '240 5.9% 10%',
    muted: '240 4.8% 95.9%',
    'muted-foreground': '240 4% 40%',
    accent: '240 4.8% 95.9%',
    'accent-foreground': '240 5.9% 10%',
    destructive: '0 72% 51%',
    'destructive-foreground': '0 0% 98%',
    success: '142 64% 38%',
    'success-foreground': '0 0% 100%',
    warning: '38 92% 50%',
    'warning-foreground': '0 0% 100%',
    info: '217 91% 60%',
    'info-foreground': '0 0% 100%',
    border: '240 5.9% 90%',
    input: '240 5.9% 90%',
    ring: '173 80% 32%',
    'chart-1': '173 70% 38%',
    'chart-2': '217 91% 60%',
    'chart-3': '38 92% 50%',
    'chart-4': '280 65% 60%',
    'chart-5': '0 72% 55%',
  },
  dark: {
    background: '240 8% 5%',
    foreground: '0 0% 98%',
    'surface-1': '240 7% 9%',
    'surface-2': '240 6% 12%',
    card: '240 7% 9%',
    'card-foreground': '0 0% 98%',
    popover: '240 6% 12%',
    'popover-foreground': '0 0% 98%',
    primary: '172 66% 50%',
    'primary-foreground': '240 10% 4%',
    secondary: '240 3.7% 15.9%',
    'secondary-foreground': '0 0% 98%',
    muted: '240 3.7% 15.9%',
    'muted-foreground': '240 5% 70%',
    accent: '240 3.7% 15.9%',
    'accent-foreground': '0 0% 98%',
    destructive: '0 62.8% 50%',
    'destructive-foreground': '0 0% 98%',
    success: '142 60% 45%',
    'success-foreground': '0 0% 100%',
    warning: '38 90% 54%',
    'warning-foreground': '0 0% 100%',
    info: '217 88% 64%',
    'info-foreground': '240 10% 4%',
    border: '240 5% 15%',
    input: '240 3.7% 18%',
    ring: '172 66% 50%',
    'chart-1': '172 60% 52%',
    'chart-2': '217 91% 64%',
    'chart-3': '38 92% 56%',
    'chart-4': '280 65% 64%',
    'chart-5': '0 72% 58%',
  },
} as const satisfies Record<Scheme, VarMap>;

export type BaseVar = keyof (typeof BASE_VARS)['light'];

/** Classic accents only override these four variables. */
function classicVars(primary: Channels, foreground: Channels, chart1: Channels): VarMap {
  return { primary, 'primary-foreground': foreground, ring: primary, 'chart-1': chart1 };
}

const INK = '240 10% 4%';
const WHITE = '0 0% 100%';

export interface AccentToken {
  label: string;
  description: string;
  /** Aurora skins restyle the whole palette (tinted base + ambient glow). */
  aurora: boolean;
  /** Overrides merged onto BASE_VARS for the `light-<id>` / `dark-<id>` themes. */
  vars: Record<Scheme, VarMap>;
  /** Native primary hex (charts, ActivityIndicator, swatches). */
  hex: Record<Scheme, string>;
  /** Native dark background for aurora skins; Classic uses NATIVE_NEUTRALS. */
  darkBackgroundHex?: string;
}

/** Key order is the emitted CSS order and the Settings picker order. */
export const ACCENT_TOKENS: Record<AccentTheme, AccentToken> = {
  indigo: {
    label: 'Indigo',
    description: 'Electric indigo — default Incline brand',
    aurora: false,
    vars: {
      light: classicVars('246 90% 66%', WHITE, '246 80% 60%'),
      dark: classicVars('246 85% 72%', INK, '246 75% 68%'),
    },
    hex: { light: '#6D5DF6', dark: '#8B7CFF' },
  },
  teal: {
    label: 'Teal',
    description: 'Athletic teal without gym-green cliché',
    aurora: false,
    vars: {
      light: classicVars('173 80% 32%', WHITE, '173 70% 38%'),
      dark: classicVars('172 66% 50%', INK, '172 60% 52%'),
    },
    hex: { light: '#0D9488', dark: '#2DD4BF' },
  },
  copper: {
    label: 'Copper',
    description: 'Warm energy on cool neutrals',
    aurora: false,
    vars: {
      light: classicVars('32 80% 57%', INK, '32 75% 52%'),
      dark: classicVars('32 85% 62%', INK, '32 80% 58%'),
    },
    hex: { light: '#E8943A', dark: '#F0A85A' },
  },
  coral: {
    label: 'Coral',
    description: 'High-energy accent (distinct from destructive)',
    aurora: false,
    vars: {
      light: classicVars('0 100% 68%', WHITE, '0 85% 62%'),
      dark: classicVars('0 90% 72%', INK, '0 80% 68%'),
    },
    hex: { light: '#FF6B6B', dark: '#FF8585' },
  },
  emerald: {
    label: 'Emerald',
    description: 'Classic fitness green (for comparison)',
    aurora: false,
    vars: {
      light: classicVars('142 69% 45%', WHITE, '142 64% 45%'),
      dark: classicVars('142 69% 47%', INK, '142 64% 48%'),
    },
    hex: { light: '#16a34a', dark: '#22c55e' },
  },
  mint: {
    label: 'Mint',
    description: 'Soft seafoam — charts and active states',
    aurora: false,
    vars: {
      light: classicVars('142 68% 48%', WHITE, '142 62% 46%'),
      dark: classicVars('142 70% 68%', INK, '142 65% 62%'),
    },
    hex: { light: '#2DB86A', dark: '#75E69C' },
  },
  rose: {
    label: 'Rose',
    description: 'Hot pink aurora — neon dark skin',
    aurora: true,
    vars: {
      light: {
        background: '336 40% 99%',
        foreground: '335 30% 12%',
        'surface-1': '336 55% 96%',
        'surface-2': '336 50% 93%',
        card: '336 60% 93%',
        'card-foreground': '335 30% 12%',
        popover: '336 55% 96%',
        'popover-foreground': '335 30% 12%',
        primary: '336 80% 50%',
        'primary-foreground': WHITE,
        secondary: '336 45% 90%',
        'secondary-foreground': '335 30% 20%',
        muted: '336 45% 90%',
        'muted-foreground': '336 18% 42%',
        accent: '336 55% 88%',
        'accent-foreground': '336 75% 38%',
        destructive: '0 72% 51%',
        'destructive-foreground': '0 0% 98%',
        border: '336 35% 86%',
        input: '336 30% 82%',
        ring: '336 80% 50%',
        'chart-1': '336 75% 55%',
      },
      dark: {
        background: '320 40% 3%',
        foreground: '330 25% 96%',
        'surface-1': '328 35% 9%',
        'surface-2': '328 32% 12%',
        card: '328 35% 9%',
        'card-foreground': '330 25% 96%',
        popover: '328 32% 12%',
        'popover-foreground': '330 25% 96%',
        primary: '331 85% 68%',
        'primary-foreground': '331 60% 12%',
        secondary: '325 32% 14%',
        'secondary-foreground': '330 25% 96%',
        muted: '328 35% 16%',
        'muted-foreground': '332 60% 74%',
        accent: '331 45% 20%',
        'accent-foreground': '331 85% 78%',
        destructive: '0 62.8% 50%',
        'destructive-foreground': '0 0% 98%',
        success: '142 60% 45%',
        'success-foreground': WHITE,
        warning: '38 90% 54%',
        'warning-foreground': WHITE,
        info: '217 88% 64%',
        'info-foreground': INK,
        border: '330 35% 24%',
        input: '330 32% 24%',
        ring: '331 85% 68%',
        'chart-1': '331 80% 62%',
        'chart-2': '217 91% 64%',
        'chart-3': '38 92% 56%',
        'chart-4': '280 65% 64%',
        'chart-5': '0 72% 58%',
      },
    },
    hex: { light: '#DB3A7B', dark: '#F368AB' },
    darkBackgroundHex: '#0b0509',
  },
  electron: {
    label: 'Electron',
    description: 'Electric cyan aurora — neon dark skin',
    aurora: true,
    vars: {
      light: {
        background: '190 40% 99%',
        foreground: '195 30% 12%',
        'surface-1': '190 55% 96%',
        'surface-2': '190 50% 93%',
        card: '190 60% 92%',
        'card-foreground': '195 30% 12%',
        popover: '190 55% 96%',
        'popover-foreground': '195 30% 12%',
        primary: '187 85% 36%',
        'primary-foreground': WHITE,
        secondary: '190 45% 89%',
        'secondary-foreground': '195 30% 20%',
        muted: '190 45% 89%',
        'muted-foreground': '192 20% 40%',
        accent: '190 55% 86%',
        'accent-foreground': '190 80% 32%',
        destructive: '0 72% 51%',
        'destructive-foreground': '0 0% 98%',
        border: '190 35% 84%',
        input: '190 30% 80%',
        ring: '187 85% 36%',
        'chart-1': '187 80% 44%',
      },
      dark: {
        background: '213 50% 3%',
        foreground: '210 20% 96%',
        'surface-1': '215 44% 8%',
        'surface-2': '215 40% 11%',
        card: '215 44% 8%',
        'card-foreground': '210 20% 96%',
        popover: '215 40% 11%',
        'popover-foreground': '210 20% 96%',
        primary: '193 90% 60%',
        'primary-foreground': '193 70% 10%',
        secondary: '213 35% 14%',
        'secondary-foreground': '210 20% 96%',
        muted: '210 35% 16%',
        'muted-foreground': '195 60% 72%',
        accent: '193 45% 20%',
        'accent-foreground': '193 85% 74%',
        destructive: '0 62.8% 50%',
        'destructive-foreground': '0 0% 98%',
        success: '142 60% 45%',
        'success-foreground': WHITE,
        warning: '38 90% 54%',
        'warning-foreground': WHITE,
        info: '217 88% 64%',
        'info-foreground': INK,
        border: '214 35% 22%',
        input: '214 32% 24%',
        ring: '193 90% 60%',
        'chart-1': '193 85% 56%',
        'chart-2': '217 91% 64%',
        'chart-3': '38 92% 56%',
        'chart-4': '280 65% 64%',
        'chart-5': '0 72% 58%',
      },
    },
    hex: { light: '#0B8A9E', dark: '#3DCDF5' },
    darkBackgroundHex: '#04070b',
  },
};

export const DEFAULT_ACCENT: AccentTheme = 'teal';

/** Uniwind theme for a scheme + accent (`dark-rose`): one `@variant` each in global.css. */
export type UniwindThemeName = `${Scheme}-${AccentTheme}`;

export function themeName(scheme: Scheme, accent: AccentTheme): UniwindThemeName {
  return `${scheme}-${accent}`;
}

/**
 * Native neutrals. Pinned hex, not derived from BASE_VARS (several differ —
 * e.g. `muted` here is the CSS `border` grey). Aurora skins only swap the
 * dark `background`; other native neutrals stay Classic.
 */
export const NATIVE_NEUTRALS = {
  light: {
    muted: '#e4e4e7',
    mutedForeground: '#62626a',
    foreground: '#09090b',
    background: '#f9f9fb',
    surface1: '#ffffff',
    surface2: '#f4f4f5',
    card: '#ffffff',
    border: '#e4e4e7',
  },
  dark: {
    muted: '#3f3f46',
    mutedForeground: '#afafb6',
    foreground: '#fafafa',
    background: '#0c0c0e',
    surface1: '#151519',
    surface2: '#1d1d20',
    card: '#151519',
    border: '#242428',
  },
} as const;

/** Supporting chart hues that sit alongside each accent without clashing. */
export const CHART_SUPPORT_HEX = {
  light: ['#F59E0B', '#A78BFA', '#F87171', '#64748B', '#0F766E'],
  dark: ['#FBBF24', '#C4B5FD', '#FB7185', '#94A3B8', '#2DD4BF'],
} as const;

/** Native `TextInput` placeholder grey (inputs cannot take Tailwind classes). */
export const PLACEHOLDER_HEX = '#71717a';

function accentToken(accent: AccentTheme): AccentToken {
  return ACCENT_TOKENS[accent] ?? ACCENT_TOKENS[DEFAULT_ACCENT];
}

/** Native hex palette for a scheme + accent. */
export function themeHex(scheme: Scheme | null | undefined, accent: AccentTheme = DEFAULT_ACCENT) {
  const mode: Scheme = scheme === 'dark' ? 'dark' : 'light';
  const token = accentToken(accent);
  return {
    ...NATIVE_NEUTRALS[mode],
    background:
      mode === 'dark'
        ? (token.darkBackgroundHex ?? NATIVE_NEUTRALS.dark.background)
        : NATIVE_NEUTRALS.light.background,
    primary: token.hex[mode],
  };
}

export type ThemeHex = ReturnType<typeof themeHex>;
