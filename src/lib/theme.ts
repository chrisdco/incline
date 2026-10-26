/**
 * Theme hex tokens for native props that cannot use Tailwind classNames
 * (ActivityIndicator, chart libs, etc.).
 * Values and the pure resolver live in `src/styles/tokens.ts`; this module
 * adds the settings-aware hooks.
 */
import { DEFAULT_ACCENT_THEME, type AccentTheme } from '@/lib/accent-themes';
import { useSettings } from '@/store/settings-store';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import { themeHex, type Scheme } from '@/styles/tokens';

export { themeHex };
export type ThemeScheme = Scheme;

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
