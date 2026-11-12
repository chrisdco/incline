/*
 * The Ask hero's dot field: the AI mark (ai-mark.tsx) rasterised to a 32×32
 * dot grid, sitting in a faint halo of smaller dots that fades with distance
 * and trails off to the left. Generated once from the mark's paths
 * (canvas coverage > 0.2 per 2×2 cell); regenerate if the mark changes.
 *
 * Built as two path strings at module load — one Path per opacity band, not
 * a thousand <Circle>s.
 */

/** Row j (top→bottom), bit i = column i (left→right) of the 32×32 mark grid. */
const MARK_ROWS = [
  '00000000', '00000000', '0007e000', '003ffc00', '007ffe00', '01fc3f80', '03e007c0', '03c003c0',
  '078001e0', '0f0000f0', '0e000070', '0e018070', '1e018078', '1c03c038', '1c0ff038', '1c1ff838',
  '1c07e038', '1e018078', '1e018070', '0e018070', '0f0000f0', '070000e0', '078000e0', '03e000f0',
  '01f81f70', '00fffff0', '003ffff8', '000ff3f8', '00000030', '00000000', '00000000', '00000000',
];

const GRID = 32;
/** Halo extent in cells around the mark: further left so it trails under the title. */
const PAD = { left: 30, top: 5, right: 5, bottom: 5 };
const BANDS = 4;

/** viewBox in cell units: the mark occupies 0..32 on both axes. */
export const HERO_DOTS_VIEWBOX = `${-PAD.left} ${-PAD.top} ${GRID + PAD.left + PAD.right} ${GRID + PAD.top + PAD.bottom}`;

const fmt = (v: number) => Math.round(v * 100) / 100;
const dot = (cx: number, cy: number, r: number) =>
  `M${fmt(cx - r)} ${fmt(cy)}a${r} ${r} 0 1 0 ${fmt(2 * r)} 0a${r} ${r} 0 1 0 ${fmt(-2 * r)} 0`;

function isMark(i: number, j: number) {
  if (i < 0 || j < 0 || i >= GRID || j >= GRID) return false;
  return ((Number.parseInt(MARK_ROWS[j], 16) >>> i) & 1) === 1;
}

function build() {
  let mark = '';
  const halo: string[] = Array.from({ length: BANDS }, () => '');
  for (let j = -PAD.top; j < GRID + PAD.bottom; j++) {
    for (let i = -PAD.left; i < GRID + PAD.right; i++) {
      const cx = i + 0.5;
      const cy = j + 0.5;
      if (isMark(i, j)) {
        mark += dot(cx, cy, 0.42);
        continue;
      }
      const d = Math.hypot(cx - GRID / 2, cy - GRID / 2) / (GRID * 0.9);
      const a = 0.22 * (1 - d);
      if (a <= 0.01) continue;
      halo[Math.min(BANDS - 1, Math.floor(a / (0.22 / BANDS)))] += dot(cx, cy, 0.25);
    }
  }
  return { mark, halo: halo.map((d, k) => ({ d, opacity: fmt(((k + 0.5) * 0.22) / BANDS) })).filter((h) => h.d) };
}

export const HERO_DOTS = build();
