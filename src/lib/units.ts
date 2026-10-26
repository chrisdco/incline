/**
 * Units: storage is canonical, conversion happens only at the edges.
 *
 * - Every stored load (set weight, volume, bodyweight, PRs) is **kilograms**;
 *   every stored length (circumference) is **centimetres**. Full REAL
 *   precision, never rounded on write.
 * - A `Unit` ('metric' | 'imperial') is a *display* choice: the global
 *   default lives in settings, and an exercise may override it.
 * - Inputs convert display → canonical on commit; formatters, charts and
 *   plate math convert canonical → display. See TECH-DECISIONS §15.
 */
import type { Unit } from '@/db/types';

export const LB_PER_KG = 2.2046226218;
export const CM_PER_IN = 2.54;

export type WeightLabel = 'kg' | 'lb';
export type LengthLabel = 'cm' | 'in';

export function weightLabel(unit: Unit): WeightLabel {
  return unit === 'imperial' ? 'lb' : 'kg';
}

export function lengthLabel(unit: Unit): LengthLabel {
  return unit === 'imperial' ? 'in' : 'cm';
}

/** Canonical kg → the number shown in `unit` (unrounded). */
export function kgToDisplay(kg: number, unit: Unit): number {
  return unit === 'imperial' ? kg * LB_PER_KG : kg;
}

/** A number typed in `unit` → canonical kg. */
export function displayToKg(value: number, unit: Unit): number {
  return unit === 'imperial' ? value / LB_PER_KG : value;
}

export function cmToDisplay(cm: number, unit: Unit): number {
  return unit === 'imperial' ? cm / CM_PER_IN : cm;
}

export function displayToCm(value: number, unit: Unit): number {
  return unit === 'imperial' ? value * CM_PER_IN : value;
}

/** A value with an explicit label ('kg' | 'lb' | 'cm' | 'in') → canonical kg/cm. */
export function labelledToCanonical(value: number, label: string): number {
  switch (label) {
    case 'lb':
      return value / LB_PER_KG;
    case 'in':
      return value * CM_PER_IN;
    default:
      return value;
  }
}

/**
 * Round a display value for an editable field: 2 decimals keeps 1.25 kg
 * plates and 2.5 lb microplates exact while hiding float noise from the
 * kg ↔ lb round trip (135 lb → 61.2349 kg → 135).
 */
export function roundForInput(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Canonical kg → editable display number. */
export function kgToInput(kg: number, unit: Unit): number {
  return roundForInput(kgToDisplay(kg, unit));
}

/**
 * Commit an edited display value. Returns null when the user left the shown
 * number untouched, so blur-without-edit never rewrites the stored kg with
 * a rounded round trip (and never enqueues a sync row for nothing).
 */
export function commitInputToKg(next: number, previousKg: number, unit: Unit): number | null {
  if (Math.abs(next - kgToInput(previousKg, unit)) < 1e-9) return null;
  return displayToKg(next, unit);
}

/**
 * Display unit for one exercise: its synced override (keyed by
 * `exerciseRefKey`) or the global default. Overrides change display only —
 * stored values are always kg.
 */
export function resolveWeightUnit(
  overrides: Readonly<Record<string, Unit>> | undefined,
  refKey: string | null | undefined,
  global: Unit,
): Unit {
  return (refKey && overrides ? overrides[refKey] : undefined) ?? global;
}
