import { describe, expect, it } from 'vitest';

import { decreaseLoad, gymIncrement, increaseLoad, roundToIncrement } from '../plates';

const KG_STANDARD = [25, 20, 15, 10, 5, 2.5, 1.25];

describe('gymIncrement (#243)', () => {
  it('is undefined with no gym, so coaching keeps the standard step', () => {
    expect(gymIncrement(null, 'metric')).toBeUndefined();
    expect(gymIncrement(undefined, 'imperial')).toBeUndefined();
  });

  it('is undefined for a gym in the other unit or with no plates', () => {
    expect(gymIncrement({ unit: 'imperial', plates: [45, 25, 10, 5, 2.5] }, 'metric')).toBeUndefined();
    expect(gymIncrement({ unit: 'metric', plates: [] }, 'metric')).toBeUndefined();
  });

  it('a full standard set behaves like no gym (never finer than the standard step)', () => {
    expect(gymIncrement({ unit: 'metric', plates: KG_STANDARD }, 'metric')).toBe(2.5);
  });

  it('no 1.25s means 5 kg jumps; no 2.5s or 1.25s means 10 kg', () => {
    expect(gymIncrement({ unit: 'metric', plates: [25, 20, 15, 10, 5, 2.5] }, 'metric')).toBe(5);
    expect(gymIncrement({ unit: 'metric', plates: [20, 10, 5] }, 'metric')).toBe(10);
  });
});

describe('load helpers with a gym increment', () => {
  it('increaseLoad steps by the gym increment', () => {
    expect(increaseLoad(100, 'metric', 5)).toBe(105);
    expect(increaseLoad(100, 'metric')).toBe(102.5);
  });

  it('decreaseLoad and roundToIncrement land on loadable weights', () => {
    expect(decreaseLoad(100, 'metric', 5)).toBe(95);
    expect(roundToIncrement(102.5, 'metric', 'up', 5)).toBe(105);
    expect(roundToIncrement(102.5, 'metric', 'down', 5)).toBe(100);
  });
});
