import { describe, expect, it } from 'vitest';

import { detectSetFatigue } from '@/coaching/fatigue';
import { dropSetLoad } from '@/coaching/plates';
import { effectiveRpe } from '@/contracts/coaching/rep-quality';
import { shouldStartRestAfterComplete } from '@/lib/superset-rest';

describe('effectiveRpe', () => {
  it('raises a dirty set to max effort', () => {
    expect(effectiveRpe(7, 'dirty')).toBe(10);
    expect(effectiveRpe(null, 'dirty')).toBe(10);
  });
  it('leaves clean sets alone', () => {
    expect(effectiveRpe(8, null)).toBe(8);
    expect(effectiveRpe(null, undefined)).toBeNull();
  });
});

describe('dropSetLoad', () => {
  it('takes about 20% off, rounded to plates', () => {
    expect(dropSetLoad(100, 'kg')).toBe(80);
  });
  it('is always at least one step lighter', () => {
    const w = dropSetLoad(5, 'kg');
    expect(w).toBeLessThan(5);
    expect(w).toBeGreaterThanOrEqual(0);
  });
  it('keeps bodyweight at 0', () => {
    expect(dropSetLoad(0, 'kg')).toBe(0);
  });
});

describe('detectSetFatigue with dirty reps', () => {
  const set = (weight: number, reps: number, repQuality: string | null = null) => ({ weight, reps, completed: true, repQuality });
  it('nags about a load drop on clean sets', () => {
    expect(detectSetFatigue([set(100, 5), set(90, 5)], 'kg')?.kind).toBe('load_drop');
  });
  it('accepts a lighter set after a dirty one', () => {
    expect(detectSetFatigue([set(100, 5, 'dirty'), set(90, 5)], 'kg')).toBeNull();
  });
  it('ignores drop sets', () => {
    expect(detectSetFatigue([set(100, 5), { ...set(80, 8), setType: 'drop' }], 'kg')).toBeNull();
  });
});

describe('rest around drop sets', () => {
  it('holds rest before an unfinished drop, starts it after', () => {
    const sets = [
      { id: 1, exerciseId: 1, setIndex: 0, completed: true, supersetGroup: null, setType: 'working' },
      { id: 2, exerciseId: 1, setIndex: 1, completed: false, supersetGroup: null, setType: 'drop' },
    ];
    expect(shouldStartRestAfterComplete(sets, 1).start).toBe(false);
    const done = sets.map((s) => ({ ...s, completed: true }));
    expect(shouldStartRestAfterComplete(done, 2).start).toBe(true);
  });
});
