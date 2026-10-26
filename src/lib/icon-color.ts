import {
  ACCENT_THEMES,
  DEFAULT_ACCENT_THEME,
  primaryForegroundChannels,
  type AccentTheme,
} from '@/lib/accent-themes';
import { useSettings } from '@/store/settings-store';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import { BASE_VARS } from '@/styles/tokens';

export type IconColor =
  | 'primary'
  | 'primary-foreground'
  | 'secondary-foreground'
  | 'muted-foreground'
  | 'destructive'
  | 'destructive-foreground'
  | 'success'
  | 'success-foreground'
  | 'warning'
  | 'warning-foreground'
  | 'info'
  | 'info-foreground'
  | 'foreground'
  | 'card-foreground'
  | 'accent-foreground'
  | 'border';

type BaseIconColor = Exclude<IconColor, 'primary' | 'primary-foreground'>;

// Classic neutrals from the token table (aurora skins don't retint icons).
function iconBase(vars: Record<BaseIconColor, string>): Record<BaseIconColor, string> {
  return Object.fromEntries(
    Object.entries(vars).map(([name, channels]) => [name, `hsl(${channels})`]),
  ) as Record<BaseIconColor, string>;
}

const pickBase = (scheme: 'light' | 'dark') => {
  const v = BASE_VARS[scheme];
  return iconBase({
    'secondary-foreground': v['secondary-foreground'],
    'muted-foreground': v['muted-foreground'],
    destructive: v.destructive,
    'destructive-foreground': v['destructive-foreground'],
    success: v.success,
    'success-foreground': v['success-foreground'],
    warning: v.warning,
    'warning-foreground': v['warning-foreground'],
    info: v.info,
    'info-foreground': v['info-foreground'],
    foreground: v.foreground,
    'card-foreground': v['card-foreground'],
    'accent-foreground': v['accent-foreground'],
    border: v.border,
  });
};

const LIGHT_BASE = pickBase('light');
const DARK_BASE = pickBase('dark');

export function resolveIconColor(
  color: IconColor | string,
  isDark: boolean,
  accent: AccentTheme = DEFAULT_ACCENT_THEME,
): string {
  if (color === 'primary') {
    const channels = isDark
      ? (ACCENT_THEMES[accent] ?? ACCENT_THEMES.indigo).dark.primary
      : (ACCENT_THEMES[accent] ?? ACCENT_THEMES.indigo).light.primary;
    return `hsl(${channels})`;
  }
  if (color === 'primary-foreground') {
    const channels = isDark
      ? (ACCENT_THEMES[accent] ?? ACCENT_THEMES.indigo).dark.primary
      : (ACCENT_THEMES[accent] ?? ACCENT_THEMES.indigo).light.primary;
    return `hsl(${primaryForegroundChannels(channels)})`;
  }
  const map = isDark ? DARK_BASE : LIGHT_BASE;
  return map[color as keyof typeof map] ?? color;
}

export function useIconColor(color: IconColor | string): string {
  const isDark = useAppColorScheme() === 'dark';
  const accent = useSettings((s) => s.accentTheme);
  return resolveIconColor(color, isDark, accent);
}
