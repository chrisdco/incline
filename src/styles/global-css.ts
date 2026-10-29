/**
 * Builds `src/global.css` (Tailwind v4 + Uniwind) and the theme-name list
 * Metro registers, from the theme tokens. Pure string assembly: both files
 * are written by the file-snapshot test (`pnpm tokens:css`), never at
 * runtime, so Uniwind compiles static CSS with zero JS theme cost.
 *
 * Theming model (Uniwind): every theme is one `@variant <name>` block that
 * defines the full color set, and one theme is active at a time. Scheme x
 * accent are therefore pre-combined into `<scheme>-<accent>` themes
 * (`dark-rose`, `light-teal`, ...) and the root layout calls
 * `Uniwind.setTheme(themeName(scheme, accent))`. The plain `light` / `dark`
 * themes Uniwind always registers carry the neutral base (what renders
 * before the first setTheme).
 */
import { ACCENT_TOKENS, BASE_VARS, RADIUS, themeName, type AccentTheme, type Scheme } from '@/styles/tokens';

export { themeName };

const SCHEMES: Scheme[] = ['light', 'dark'];

function accentIds(): AccentTheme[] {
  return Object.keys(ACCENT_TOKENS) as AccentTheme[];
}

/** Every custom theme name, in emitted order (`extraThemes` in metro.config.js). */
export function extraThemeNames(): string[] {
  return accentIds().flatMap((id) => SCHEMES.map((s) => themeName(s, id)));
}

/**
 * Full variable set for a scheme + accent. Mirrors the old cascade
 * (`:root`/`.dark`, then `.theme-x`, then `.dark.theme-x`).
 */
export function themeVars(scheme: Scheme, accent?: AccentTheme): Record<string, string> {
  const base: Record<string, string> = { ...BASE_VARS[scheme] };
  if (!accent) return base;
  const token = ACCENT_TOKENS[accent];
  return scheme === 'dark'
    ? { ...base, ...token.vars.light, ...token.vars.dark }
    : { ...base, ...token.vars.light };
}

/** Token var name -> Tailwind color name (`surface-1` -> `surface1`, `chart-1` -> `chart1`). */
function colorName(token: string): string {
  return token.replace(/^(surface|chart)-(\d)$/, '$1$2');
}

const HEADER = `/*
 * GENERATED from src/styles/tokens.ts by src/styles/global-css.ts. Do not edit by hand.
 * Change tokens.ts, then run \`pnpm tokens:css\` (CI fails when this is stale).
 */
@import 'tailwindcss';
@import 'uniwind';

/*
 * Type scale + radii (docs/design/SYSTEM.md). rem = 14px (polyfills.rem in
 * metro.config.js), so Tailwind's rem-based defaults keep their NativeWind sizes.
 */
@theme {
  --font-sans: Geist;

  --text-2xs: 11px;
  --text-2xs--line-height: 14px;
  --text-display: 34px;
  --text-display--line-height: 40px;
  --text-display--letter-spacing: -0.5px;

  --radius-sm: calc(${RADIUS} - 4px);
  --radius-md: calc(${RADIUS} - 2px);
  --radius-lg: ${RADIUS};
}

/*
 * Weight utilities name the registered Geist faces: React Native ignores
 * fontWeight for custom fonts unless the face itself is referenced.
 * The family is !important because Uniwind resolves conflicts by CSS cascade,
 * not className order, and Tailwind emits these two-property utilities before
 * single-property font-sans (the <Text> base class), which would win.
 */
@utility font-medium {
  font-family: Geist-Medium !important;
  font-weight: 500;
}
@utility font-semibold {
  font-family: Geist-SemiBold !important;
  font-weight: 600;
}
@utility font-bold {
  font-family: Geist-Bold !important;
  font-weight: 700;
}
@utility font-extrabold {
  font-family: Geist-Bold !important;
  font-weight: 800;
}

/*
 * Themes. \`light\` / \`dark\` are the neutral base; \`<scheme>-<accent>\`
 * pre-combine the base with an accent (classic accents override primary /
 * ring / chart-1, aurora skins restyle the palette). The root layout picks
 * one with Uniwind.setTheme.
 */
`;

function variant(name: string, vars: Readonly<Record<string, string>>): string {
  const lines = Object.entries(vars).map(([token, value]) => `      --color-${colorName(token)}: hsl(${value});`);
  return `    @variant ${name} {\n${lines.join('\n')}\n    }\n`;
}

export function buildGlobalCss(): string {
  const blocks = [
    ...SCHEMES.map((s) => variant(s, themeVars(s))),
    ...accentIds().flatMap((id) => SCHEMES.map((s) => variant(themeName(s, id), themeVars(s, id)))),
  ];
  return `${HEADER}@layer theme {\n  :root {\n${blocks.join('\n')}  }\n}\n`;
}

/** `src/styles/uniwind-themes.json`, read by metro.config.js for `extraThemes`. */
export function buildThemeList(): string {
  return `${JSON.stringify(extraThemeNames(), null, 2)}\n`;
}
