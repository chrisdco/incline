/**
 * Builds `src/global.css` from the theme tokens. Pure string assembly — the
 * file is written by the file-snapshot test (`pnpm tokens:css`), never at
 * runtime, so NativeWind keeps compiling static CSS with zero JS theme cost.
 */
import { ACCENT_TOKENS, BASE_VARS, RADIUS, type AccentTheme } from '@/styles/tokens';

const HEADER = `/*
 * GENERATED from src/styles/tokens.ts — do not edit by hand.
 * Change tokens.ts, then run \`pnpm tokens:css\` (CI fails when this is stale).
 */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    border-color: hsl(var(--border));
  }
}

/*
 * Neutrals + semantic colors live on :root / .dark.
 * Brand accent (primary / ring / chart-1) is set by theme-* classes on the root View
 * so Settings can swap accents without touching the rest of the palette.
 * Default accent: indigo (also applied via theme-indigo on the root View).
 */
`;

function block(selector: string, vars: Readonly<Record<string, string>>, radius = false): string {
  const lines = Object.entries(vars).map(([name, value]) => `  --${name}: ${value};`);
  if (radius) lines.push(`  --radius: ${RADIUS};`);
  return `${selector} {\n${lines.join('\n')}\n}\n`;
}

function accentBlocks(ids: AccentTheme[]): string {
  return ids
    .map((id) => block(`.theme-${id}`, ACCENT_TOKENS[id].vars.light) + block(`.dark.theme-${id}`, ACCENT_TOKENS[id].vars.dark))
    .join('\n');
}

export function buildGlobalCss(): string {
  const ids = Object.keys(ACCENT_TOKENS) as AccentTheme[];
  const classic = ids.filter((id) => !ACCENT_TOKENS[id].aurora);
  const aurora = ids.filter((id) => ACCENT_TOKENS[id].aurora);
  return [
    HEADER,
    block(':root', BASE_VARS.light, true),
    '\n',
    block('.dark', BASE_VARS.dark, true),
    '\n/* ---- Accent themes (override primary / ring / chart-1 only) ---- */\n\n',
    accentBlocks(classic),
    '\n/* ---- Neon aurora skins: tinted near-black bases (ref screenshots) ---- */\n\n',
    accentBlocks(aurora),
  ].join('');
}
