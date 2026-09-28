/**
 * Theme hex tokens for native props that cannot use Tailwind classNames
 * (ActivityIndicator, chart libs, etc.).
 * Accent primary comes from the selected brand theme; neutrals stay fixed.
 */
import { ACCENT_THEMES, DEFAULT_ACCENT_THEME, type AccentTheme } from '@/lib/accent-themes';
import { useSettings } from '@/store/settings-store';
import { useAppColorScheme } from '@/lib/use-color-scheme';

const NEUTRALS = {
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

export type ThemeScheme = 'light' | 'dark';

/** Tinted dark bases for the aurora skins — must match global.css. */
const DARK_BASE: Partial<Record<AccentTheme, string>> = {
  rose: '#0b0509',
  electron: '#04070b',
};

export function themeHex(
  scheme: ThemeScheme | null | undefined,
  accent: AccentTheme = DEFAULT_ACCENT_THEME,
) {
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const def = ACCENT_THEMES[accent] ?? ACCENT_THEMES[DEFAULT_ACCENT_THEME];
  return {
    ...NEUTRALS[mode],
    background: mode === 'dark' ? (DARK_BASE[accent] ?? NEUTRALS.dark.background) : NEUTRALS.light.background,
    primary: def.hex[mode],
  };
}

export function primaryHex(
  scheme: ThemeScheme | null | undefined,
  accent: AccentTheme = DEFAULT_ACCENT_THEME,
): string {
  return themeHex(scheme, accent).primary;
}

/** Primary hex honoring Settings accent + effective color scheme. */
export function usePrimaryHex(): string {
  const scheme = useAppColorScheme();
  const accent = useSettings((s) => s.accentTheme);
  return primaryHex(scheme, accent);
}

/** Full theme hex object for the current accent + scheme. */
export function useThemeHex() {
  const scheme = useAppColorScheme();
  const accent = useSettings((s) => s.accentTheme);
  return themeHex(scheme, accent);
}

/** Convert `#RRGGBB` to `rgba(r,g,b,a)` for gradients / chart fills. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
