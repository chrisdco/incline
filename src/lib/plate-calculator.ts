/**
 * Plate calculator — given a target weight, barbell weight and whether the
 * bar is counted, returns the plates to load on each side.
 */

export interface Plate {
  weight: number;
  count: number;
}

export type BarKind = 'barbell' | 'ez' | 'smith';

export interface BarOption {
  kind: BarKind;
  label: string;
  kg: number;
  lb: number;
}

export const BAR_OPTIONS: BarOption[] = [
  { kind: 'barbell', label: 'Barbell', kg: 20, lb: 45 },
  { kind: 'ez', label: 'EZ bar', kg: 10, lb: 22 },
  { kind: 'smith', label: 'Smith', kg: 15, lb: 34 },
];

const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
const LB_PLATES = [45, 35, 25, 10, 5, 2.5, 1.25];

/** The full standard plate set for a unit, heaviest first (a gym's default inventory). */
export function standardPlates(unit: 'kg' | 'lb'): number[] {
  return [...(unit === 'kg' ? KG_PLATES : LB_PLATES)];
}

/** Standard Olympic bar for a unit (20 kg / 45 lb). */
export function standardBar(unit: 'kg' | 'lb'): number {
  return unit === 'kg' ? 20 : 45;
}

/**
 * Calculate plates needed per side.
 * `barWeight` is in the target unit; pass 0 to exclude the bar (target weight
 * is then the total plate load, split across both sides).
 * Returns null if the target weight is less than the bar weight.
 * `remainderPerSide` is the load per side the plate set cannot make (0 when exact).
 * `inventory` is the plate sizes a gym actually has (in `unit`); omitted or
 * empty means the full standard set.
 */
export function calculatePlates(
  targetWeight: number,
  unit: 'kg' | 'lb' = 'kg',
  barWeight = 20,
  inventory?: readonly number[] | null,
): { plates: Plate[]; totalPerSide: number; barbell: number; remainderPerSide: number } | null {
  const barbell = Math.max(0, barWeight);
  const availablePlates =
    inventory && inventory.length > 0
      ? [...new Set(inventory.filter((p) => p > 0))].sort((a, b) => b - a)
      : unit === 'kg' ? KG_PLATES : LB_PLATES;

  const plateLoad = targetWeight - barbell;
  if (plateLoad < 0) return null;

  const perSide = plateLoad / 2;
  let remaining = perSide;
  const plates: Plate[] = [];

  for (const plateWeight of availablePlates) {
    let count = 0;
    while (remaining >= plateWeight - 0.001) {
      count++;
      remaining -= plateWeight;
    }
    if (count > 0) {
      plates.push({ weight: plateWeight, count });
    }
  }

  return {
    plates,
    totalPerSide: perSide,
    barbell,
    // What the plate set can't make, per side (#173: never drop it silently).
    remainderPerSide: Math.round(Math.max(0, remaining) * 100) / 100,
  };
}
