import { describe, expect, it } from 'vitest';

import { formatDisplayWeight, formatVolume, formatWeight } from '@/db/calc';
import { decreaseLoad, increaseLoad, roundToIncrement } from '@/coaching/plates';
import {
  commitInputToKg,
  createWeightEdit,
  displayToKg,
  kgToDisplay,
  kgToInput,
  labelledToCanonical,
  LB_PER_KG,
  resolveWeightUnit,
} from '../units';

describe('units', () => {
  it('round-trips a typed pound value through canonical kg', () => {
    const kg = displayToKg(135, 'imperial');
    expect(kg).toBeCloseTo(61.235, 3);
    expect(kgToInput(kg, 'imperial')).toBe(135);
    expect(kgToInput(kg, 'metric')).toBe(61.23);
  });

  it('keeps microplate precision in kg', () => {
    expect(kgToInput(1.25, 'metric')).toBe(1.25);
    expect(kgToInput(displayToKg(2.5, 'imperial'), 'imperial')).toBe(2.5);
  });

  it('commit ignores a blur that did not change the shown number', () => {
    const stored = displayToKg(135, 'imperial');
    expect(commitInputToKg(135, stored, 'imperial')).toBeNull();
    expect(commitInputToKg(140, stored, 'imperial')).toBeCloseTo(140 / LB_PER_KG, 9);
  });

  it('a toggle converts the shown value and never rewrites stored kg (#136)', () => {
    const stored = 100;
    // Toggle: the same canonical kg is shown converted, not relabelled.
    expect(kgToInput(stored, 'metric')).toBe(100);
    expect(kgToInput(stored, 'imperial')).toBe(220.46);
    // Field focused in kg, unit flipped to lb before blur, draft untouched.
    const edit = createWeightEdit();
    edit.begin('metric');
    expect(edit.commit(100, stored, 'imperial')).toBeNull();
    // Without the pin the same blur would store 100 lb as kg.
    expect(commitInputToKg(100, stored, 'imperial')).toBeCloseTo(100 / LB_PER_KG, 9);
  });

  it('a draft typed before a toggle commits in the unit it was typed in', () => {
    const edit = createWeightEdit();
    edit.begin('metric');
    expect(edit.commit(105, 100, 'imperial')).toBe(105);
    // The pin clears: the next edit with no focus event uses the current unit.
    expect(edit.commit(225, 100, 'imperial')).toBeCloseTo(225 / LB_PER_KG, 9);
  });

  it('normalizes labelled rows to canonical kg/cm', () => {
    expect(labelledToCanonical(100, 'kg')).toBe(100);
    expect(labelledToCanonical(220.46226218, 'lb')).toBeCloseTo(100, 6);
    expect(labelledToCanonical(10, 'in')).toBeCloseTo(25.4, 9);
    expect(labelledToCanonical(80, 'cm')).toBe(80);
  });

  it('formats canonical kg in the display unit (#136: no relabel-only)', () => {
    expect(formatWeight(100, 'metric')).toBe('100 kg');
    expect(formatWeight(100, 'imperial')).toBe('220.5 lb');
    expect(formatWeight(0, 'imperial')).toBe('—');
    expect(formatVolume(1000, 'imperial')).toBe('2.2k lb');
    expect(formatDisplayWeight(135, 'imperial')).toBe('135 lb');
    expect(kgToDisplay(100, 'metric')).toBe(100);
  });
});

describe('plate math is canonical in, display-unit increments', () => {
  it('metric: +2.5 kg steps', () => {
    expect(increaseLoad(100, 'metric')).toBe(102.5);
    expect(decreaseLoad(100, 'metric')).toBe(97.5);
  });

  it('imperial: +5 lb steps that land on plates', () => {
    const kg135 = displayToKg(135, 'imperial');
    expect(kgToInput(increaseLoad(kg135, 'imperial'), 'imperial')).toBe(140);
    expect(kgToInput(decreaseLoad(kg135, 'imperial'), 'imperial')).toBe(130);
  });

  it('imperial: snaps an off-plate kg weight to the nearest 5 lb', () => {
    // 60 kg = 132.3 lb → 130 lb
    expect(kgToInput(roundToIncrement(60, 'imperial'), 'imperial')).toBe(130);
  });
});

describe('per-exercise unit', () => {
  it('uses the override for its exercise and the global unit otherwise', () => {
    const overrides = { 'catalog:0025': 'imperial' as const };
    expect(resolveWeightUnit(overrides, 'catalog:0025', 'metric')).toBe('imperial');
    expect(resolveWeightUnit(overrides, 'catalog:0031', 'metric')).toBe('metric');
    expect(resolveWeightUnit(overrides, null, 'metric')).toBe('metric');
    expect(resolveWeightUnit(undefined, 'catalog:0025', 'imperial')).toBe('imperial');
  });

  it('switching an exercise unit never changes the stored kg', () => {
    const storedKg = 100;
    expect(formatWeight(storedKg, resolveWeightUnit({ x: 'imperial' }, 'x', 'metric'))).toBe('220.5 lb');
    expect(formatWeight(storedKg, resolveWeightUnit({}, 'x', 'metric'))).toBe('100 kg');
  });
});
