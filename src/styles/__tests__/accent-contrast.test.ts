/**
 * Every classic accent stays readable in both schemes (WCAG AA, 4.5:1):
 * accent text/icons on the screen and card neutrals, and the label on a
 * filled accent button. Aurora skins tint their own surfaces and are exempt.
 */
import { describe, expect, it } from 'vitest';

import { ACCENT_TOKENS, NATIVE_NEUTRALS, type AccentTheme, type Scheme } from '@/styles/tokens';

function hslToRgb(channels: string): number[] {
  const [h, s, l] = channels.replace(/%/g, '').split(/\s+/).map(Number);
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const CLASSIC = (Object.keys(ACCENT_TOKENS) as AccentTheme[]).filter((a) => !ACCENT_TOKENS[a].aurora);
const CASES = CLASSIC.flatMap((a) => (['light', 'dark'] as Scheme[]).map((s) => [a, s] as const));

describe('accent contrast', () => {
  it.each(CASES)('%s / %s: text tone on background and card', (accent, scheme) => {
    const vars = ACCENT_TOKENS[accent].vars[scheme];
    const text = hslToRgb(vars['primary-text']);
    for (const bg of [NATIVE_NEUTRALS[scheme].background, NATIVE_NEUTRALS[scheme].surface1]) {
      expect(contrast(text, hexToRgb(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(CASES)('%s / %s: label on the filled accent', (accent, scheme) => {
    const vars = ACCENT_TOKENS[accent].vars[scheme];
    expect(contrast(hslToRgb(vars['primary-foreground']), hslToRgb(vars.primary))).toBeGreaterThanOrEqual(4.5);
  });
});
