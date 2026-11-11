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
