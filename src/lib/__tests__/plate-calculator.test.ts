import { describe, expect, it } from 'vitest';

import { calculatePlates } from '../plate-calculator';

describe('calculatePlates remainder (#173)', () => {
  it('is 0 when the plates make the weight exactly', () => {
    const r = calculatePlates(102.5, 'kg', 20)!;
    expect(r.plates).toEqual([
      { weight: 25, count: 1 },
      { weight: 15, count: 1 },
      { weight: 1.25, count: 1 },
    ]);
    expect(r.remainderPerSide).toBe(0);
  });

  it('reports what the plate set cannot make instead of dropping it', () => {
    const r = calculatePlates(101, 'kg', 20)!;
    expect(r.remainderPerSide).toBe(0.5);
  });

  it('returns null below the bar', () => {
    expect(calculatePlates(15, 'kg', 20)).toBeNull();
  });
});

describe('calculatePlates with a gym inventory (#243)', () => {
  it('uses only the plates the gym has; missing 1.25s leave a remainder', () => {
    const r = calculatePlates(102.5, 'kg', 20, [25, 20, 15, 10, 5, 2.5])!;
    expect(r.plates).toEqual([
      { weight: 25, count: 1 },
      { weight: 15, count: 1 },
    ]);
    expect(r.remainderPerSide).toBe(1.25);
  });

  it('honours a non-standard bar and unsorted, duplicate inventory', () => {
    const r = calculatePlates(55, 'kg', 15, [5, 20, 20, 0])!;
    expect(r.plates).toEqual([{ weight: 20, count: 1 }]);
    expect(r.remainderPerSide).toBe(0);
  });

  it('falls back to the standard set for an empty inventory', () => {
    expect(calculatePlates(102.5, 'kg', 20, [])).toEqual(calculatePlates(102.5, 'kg', 20));
  });
});
