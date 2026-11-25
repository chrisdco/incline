import { describe, expect, it } from 'vitest';

import { clampWarmups, describeRoutineSets, warmupSeedWeight } from '@/contracts/templates/warmups';

describe('routine warm-ups', () => {
  it('clamps the count to 0..10', () => {
    expect(clampWarmups(undefined)).toBe(0);
    expect(clampWarmups(-1)).toBe(0);
    expect(clampWarmups(2.6)).toBe(3);
    expect(clampWarmups(40)).toBe(10);
  });

  it('ramps seed weights toward the working weight, rounded down to 2.5', () => {
    expect(warmupSeedWeight(100, 0, 1)).toBe(50);
    expect([0, 1, 2].map((i) => warmupSeedWeight(100, i, 3))).toEqual([40, 57.5, 75]);
    expect(warmupSeedWeight(0, 0, 2)).toBe(0);
  });

  it('phrases sets with and without warm-ups', () => {
    expect(describeRoutineSets(3, 0)).toBe('3 sets');
    expect(describeRoutineSets(1, 2)).toBe('2 warm-ups + 1 set');
  });
});
