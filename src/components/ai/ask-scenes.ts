import type { SceneKind } from '@/ai/ask-brief';

/*
 * Ask's dither scenes (ASK-UI.md "Contextual visuals"): a deterministic dot
 * field from `{ kind, seed }`. Same inputs, same dots — testable, offline, no
 * assets. Output is a few path strings (one per opacity band), like
 * ai-hero-dots.ts, so a scene is one <Svg> with ~4 <Path>s.
 *
 * Scenes are mood, never data: the number lives in the headline.
 */

export const SCENE_COLS = 44;
export const SCENE_ROWS = 26;
export const SCENE_VIEWBOX = `0 0 ${SCENE_COLS} ${SCENE_ROWS}`;
const BANDS = 4;
const R = 0.3;

/** mulberry32: tiny, fast, good enough for dither. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a: a stable seed from a string. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** ISO-ish week number: the field shifts weekly, never between opens. */
export function weekKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return `${d.getUTCFullYear()}-W${Math.ceil(((d.getTime() - start) / 86_400_000 + 1) / 7)}`;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Density 0..1 at (x, y), both 0..1 with y = 0 at the top. */
const DENSITY: Record<SceneKind, (x: number, y: number) => number> = {
  // Halo around where the mark sits (upper centre).
  mark: (x, y) => 0.75 * (1 - smooth(0, 0.55, Math.hypot(x - 0.5, (y - 0.38) * 1.4))),
  // Denser towards the top right: an upward lean.
  rise: (x, y) => 0.12 + 0.75 * x * (1 - y),
  // Even field with a slow row rhythm.
  steady: (_x, y) => 0.42 + 0.18 * Math.sin(y * Math.PI * 6),
  // A soft opening in the middle.
  gap: (x, y) => 0.6 * smooth(0.12, 0.38, Math.hypot(x - 0.5, (y - 0.45) * 1.3)),
  // Two halves at different weights.
  balance: (x) => (x < 0.5 ? 0.7 : 0.22) * (1 - 0.3 * Math.abs(x - 0.5)),
  // Light scatter.
  fresh: (_x, y) => 0.2 * (1 - 0.5 * y),
};

const fmt = (v: number) => Math.round(v * 100) / 100;
const dot = (cx: number, cy: number) => `M${fmt(cx - R)} ${fmt(cy)}a${R} ${R} 0 1 0 ${fmt(2 * R)} 0a${R} ${R} 0 1 0 ${fmt(-2 * R)} 0`;

export interface SceneDots {
  bands: { d: string; opacity: number }[];
}

export function sceneDots(kind: SceneKind, seed: number): SceneDots {
  const rand = rng(seed);
  const density = DENSITY[kind] ?? DENSITY.mark;
  // Seeded drift so the same kind still varies week to week.
  const ox = (rand() - 0.5) * 0.16;
  const oy = (rand() - 0.5) * 0.1;
  const paths: string[] = Array.from({ length: BANDS }, () => '');
  for (let j = 0; j < SCENE_ROWS; j++) {
    for (let i = 0; i < SCENE_COLS; i++) {
      const x = (i + 0.5) / SCENE_COLS;
      const y = (j + 0.5) / SCENE_ROWS;
      const p = clamp(density(clamp(x + ox), clamp(y + oy)));
      const r = rand();
      if (r >= p) continue;
      // Stronger where the field is denser; dots further from the threshold read brighter.
      const band = Math.min(BANDS - 1, Math.floor((p * 0.6 + (1 - r / p) * 0.4) * BANDS));
      paths[band] += dot(i + 0.5, j + 0.5);
    }
  }
  return {
    bands: paths.map((d, k) => ({ d, opacity: fmt(0.12 + (k / (BANDS - 1)) * 0.4) })).filter((b) => b.d),
  };
}
