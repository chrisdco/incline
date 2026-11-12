import type { Gym, Unit } from '@/db/types';
import { displayToKg, kgToDisplay } from '@/lib/units';

/**
 * Plate math. Weights in and out are canonical **kg**; the increment and the
 * rounding happen in the display unit, so an imperial lifter gets 5 lb jumps
 * that land on real plates (135 → 140 lb), not 2.5 kg jumps shown as 5.5 lb.
 *
 * Every helper takes an optional `increment` (display unit) for a gym with
 * its own plate inventory (#243); omitted = the standard step.
 */

/** Smallest standard load increment, in the display unit. */
export function smallestIncrement(unit: Unit): number {
  return unit === 'metric' ? 2.5 : 5;
}

/**
 * The jump a gym's plates allow, in `displayUnit`: one pair of its smallest
 * plate, never finer than the standard step (a full standard set behaves
 * exactly as no gym). `undefined` (use the standard step) when there is no
 * gym, the gym is in the other unit, or it lists no plates.
 */
export function gymIncrement(
  gym: Pick<Gym, 'unit' | 'plates'> | null | undefined,
  displayUnit: Unit,
): number | undefined {
  if (!gym || gym.unit !== displayUnit) return undefined;
  const sizes = gym.plates.filter((p) => p > 0);
  if (sizes.length === 0) return undefined;
  return Math.max(smallestIncrement(displayUnit), Math.min(...sizes) * 2);
}

function stepFor(unit: Unit, increment: number | undefined): number {
  return increment != null && increment > 0 ? increment : smallestIncrement(unit);
}

function roundDisplay(value: number, inc: number, direction: 'up' | 'nearest' | 'down'): number {
  const steps = value / inc;
  if (direction === 'up') return Math.ceil(steps - 1e-9) * inc;
  if (direction === 'nearest') return Math.round(steps) * inc;
  return Math.floor(steps + 1e-9) * inc;
}

/** Snap a kg weight to the nearest valid plate increment of `unit`. */
export function roundToIncrement(
  weightKg: number,
  unit: Unit,
  direction: 'up' | 'nearest' | 'down' = 'nearest',
  increment?: number,
): number {
  const inc = stepFor(unit, increment);
  if (inc <= 0 || weightKg <= 0) return weightKg;
  return displayToKg(roundDisplay(kgToDisplay(weightKg, unit), inc, direction), unit);
}

export function increaseLoad(weightKg: number, unit: Unit, increment?: number): number {
  const inc = stepFor(unit, increment);
  const shown = kgToDisplay(weightKg, unit);
  return displayToKg(roundDisplay(shown + inc, inc, 'nearest'), unit);
}

export function decreaseLoad(weightKg: number, unit: Unit, increment?: number): number {
  const inc = stepFor(unit, increment);
  const shown = kgToDisplay(weightKg, unit);
  return Math.max(0, displayToKg(roundDisplay(shown - inc, inc, 'nearest'), unit));
}
