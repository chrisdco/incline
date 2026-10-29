import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { buildGlobalCss, buildThemeList, extraThemeNames, themeName } from '@/styles/global-css';
import { ACCENT_TOKENS, RADIUS, type AccentTheme, type Scheme } from '@/styles/tokens';

// theme.ts / icon-color.ts export hooks that read the settings store; the
// pure resolvers under test never call them.
vi.mock('@/store/settings-store', () => ({ useSettings: () => undefined }));
vi.mock('@/lib/use-color-scheme', () => ({ useAppColorScheme: () => 'light' }));

/**
 * Captured from main (aa186b9) before tokens.ts existed: every native hex and
 * the hand-written global.css. Pins the token refactor to zero visual change.
 * An intentional palette change should update this fixture in the same PR.
 */
const baseline = JSON.parse(
  readFileSync(path.resolve(__dirname, '__fixtures__/theme-baseline.json'), 'utf8'),
);

const ACCENTS = Object.keys(ACCENT_TOKENS) as AccentTheme[];
const SCHEMES: Scheme[] = ['light', 'dark'];
const ICONS = [
  'primary', 'primary-foreground', 'secondary-foreground', 'muted-foreground', 'destructive',
  'destructive-foreground', 'success', 'success-foreground', 'warning', 'warning-foreground', 'info',
  'info-foreground', 'foreground', 'card-foreground', 'accent-foreground', 'border',
] as const;

function hslToHex(channels: string): string {
  const [h, s, l] = channels.replace(/%/g, '').split(/\s+/).map(Number);
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Resolve the custom properties the root View sees for a scheme + accent,
 * following CSS cascade: :root first, then matching classes by specificity,
 * then source order.
 */
function resolveVars(css: string, scheme: Scheme, accent: AccentTheme): Record<string, string> {
  const classes = new Set([`theme-${accent}`, ...(scheme === 'dark' ? ['dark'] : [])]);
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m, order) => ({ selector: m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: m[2], order }))
    .filter((r) => r.selector === ':root' || /^(\.[\w-]+)+$/.test(r.selector))
    .map((r) => {
      const parts = r.selector === ':root' ? [] : r.selector.slice(1).split('.');
      return { ...r, parts, root: r.selector === ':root' };
    })
    .filter((r) => r.root || r.parts.every((p) => classes.has(p)))
    .sort((a, b) => Number(b.root) - Number(a.root) || a.parts.length - b.parts.length || a.order - b.order);
  const out: Record<string, string> = {};
  for (const rule of rules) {
    for (const [, name, value] of rule.body.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[name] = value.trim();
  }
  return Object.fromEntries(
    Object.entries(out).map(([k, v]) => [k, k === 'radius' ? v : hslToHex(v)]),
  );
}

/** Color variables of one Uniwind `@variant <theme>` block, in the baseline's naming (hex). */
function uniwindThemeVars(css: string, theme: string): Record<string, string> {
  const body = css.match(new RegExp(`@variant ${theme} \\{([^{}]*)\\}`))?.[1];
  if (!body) throw new Error(`no @variant ${theme}`);
  const out: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/--color-([\w-]+):\s*hsl\(([^)]+)\);/g)) {
    out[name.replace(/^(surface|chart)(\d)$/, '$1-$2')] = hslToHex(value);
  }
  return out;
}

describe('global.css generation', () => {
  it('global.css is up to date with tokens.ts (run `pnpm tokens:css`)', async () => {
    await expect(buildGlobalCss()).toMatchFileSnapshot('../../global.css');
  });

  it('uniwind-themes.json is up to date with tokens.ts (run `pnpm tokens:css`)', async () => {
    await expect(buildThemeList()).toMatchFileSnapshot('../uniwind-themes.json');
  });

  it.each(ACCENTS.flatMap((a) => SCHEMES.map((s) => [a, s] as const)))(
    'resolves the same CSS colors as before: %s / %s',
    (accent, scheme) => {
      const { radius, ...before } = resolveVars(baseline.globalCss, scheme, accent);
      expect(radius).toBe(RADIUS);
      expect(Object.keys(before).length).toBeGreaterThan(30);
      expect(uniwindThemeVars(buildGlobalCss(), themeName(scheme, accent))).toEqual(before);
    },
  );

  it.each(SCHEMES)('base %s theme matches the old :root / .dark', (scheme) => {
    // No theme-* class on the root: only :root / .dark apply.
    const { radius: _radius, ...before } = resolveVars(baseline.globalCss, scheme, 'none' as AccentTheme);
    expect(uniwindThemeVars(buildGlobalCss(), scheme)).toEqual(before);
  });

  it('every theme defines the same variables (Uniwind requirement)', () => {
    const css = buildGlobalCss();
    const keys = (t: string) => Object.keys(uniwindThemeVars(css, t)).sort();
    for (const t of ['dark', ...extraThemeNames()]) expect(keys(t)).toEqual(keys('light'));
  });
});

describe('native hex', () => {
  it('accent theme table is unchanged', async () => {
    const at = await import('@/lib/accent-themes');
    expect(JSON.parse(JSON.stringify(at.ACCENT_THEMES))).toEqual(baseline.accentThemes);
    expect(at.ACCENT_THEME_LIST.map((t) => t.id)).toEqual(baseline.accentList);
    expect(at.CLASSIC_ACCENTS.map((t) => t.id)).toEqual(baseline.classic);
    expect(at.DEFAULT_ACCENT_THEME).toBe(baseline.defaultAccent);
  });

  it('themeHex defaults are unchanged', async () => {
    const { themeHex } = await import('@/lib/theme');
    expect({ light: themeHex('light'), dark: themeHex('dark'), nil: themeHex(null) }).toEqual(
      baseline.themeHexDefault,
    );
  });

  it.each(ACCENTS)('%s: themeHex, chart, icon and widget colors are unchanged', async (accent) => {
    const { themeHex } = await import('@/lib/theme');
    const { chartPaletteFor, isAuroraAccent } = await import('@/lib/accent-themes');
    const { resolveIconColor } = await import('@/lib/icon-color');
    const { widgetPalettes } = await import('@/lib/widgets/palette');
    const expected = baseline.perAccent[accent];
    for (const scheme of SCHEMES) {
      expect(themeHex(scheme, accent)).toEqual(expected[scheme].themeHex);
      expect(chartPaletteFor(accent, scheme)).toEqual(expected[scheme].chart);
      expect(
        Object.fromEntries(ICONS.map((c) => [c, resolveIconColor(c, scheme === 'dark', accent)])),
      ).toEqual(expected[scheme].icons);
    }
    expect(widgetPalettes(accent)).toEqual(expected.widget);
    expect(isAuroraAccent(accent)).toBe(expected.aurora);
  });
});
