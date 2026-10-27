import type { Unit } from '@/db/types';
import { displayToKg, kgToDisplay } from '@/lib/units';

/**
 * Plate math. Weights in and out are canonical **kg**; the increment and the
 * rounding happen in the display unit, so an imperial lifter gets 5 lb jumps
 * that land on real plates (135 → 140 lb), not 2.5 kg jumps shown as 5.5 lb.
 */

/** Smallest standard load increment, in the display unit. */
export function smallestIncrement(unit: Unit): number {
  return unit === 'metric' ? 2.5 : 5;
}

function roundDisplay(value: number, inc: number, direction: 'up' | 'nearest' | 'down'): number {
  const steps = value / inc;
  if (direction === 'up') return Math.ceil(steps - 1e-9) * inc;
  if (direction === 'nearest') return Math.round(steps) * inc;
  return Math.floor(steps + 1e-9) * inc;
}

/** Snap a kg weight to the nearest valid plate increment of `unit`. */
export function roundToIncrement(weightKg: number, unit: Unit, direction: 'up' | 'nearest' | 'down' = 'nearest'): number {
  const inc = smallestIncrement(unit);
  if (inc <= 0 || weightKg <= 0) return weightKg;
  return displayToKg(roundDisplay(kgToDisplay(weightKg, unit), inc, direction), unit);
}

export function increaseLoad(weightKg: number, unit: Unit): number {
  const inc = smallestIncrement(unit);
  const shown = kgToDisplay(weightKg, unit);
  return displayToKg(roundDisplay(shown + inc, inc, 'nearest'), unit);
}

export function decreaseLoad(weightKg: number, unit: Unit): number {
  const inc = smallestIncrement(unit);
  const shown = kgToDisplay(weightKg, unit);
  return Math.max(0, displayToKg(roundDisplay(shown - inc, inc, 'nearest'), unit));
}
