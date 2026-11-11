import { describe, expect, it } from 'vitest';

import { estimated1RM, formatClock, isoDate, repsToBeat1RM, setVolume, startOfDay, startOfWeek } from '../calc';

describe('calc helpers', () => {
  it('estimated1RM uses Epley and handles edge cases', () => {
    expect(estimated1RM(100, 1)).toBe(100);
    expect(estimated1RM(100, 5)).toBeCloseTo(116.67, 1);
    expect(estimated1RM(0, 5)).toBe(0);
    expect(estimated1RM(100, 0)).toBe(0);
  });

  it('repsToBeat1RM finds the first Epley-beating rep count', () => {
    expect(repsToBeat1RM(100, 116.67)).toBe(6);
    expect(repsToBeat1RM(120, 100)).toBe(1);
    expect(repsToBeat1RM(0, 100)).toBeNull();
    expect(repsToBeat1RM(10, 1000)).toBeNull();
  });

  it('setVolume multiplies weight and reps', () => {
    expect(setVolume(80, 5)).toBe(400);
  });

  it('isoDate formats local YYYY-MM-DD', () => {
    const ms = new Date(2024, 0, 15, 12, 0, 0).getTime();
    expect(isoDate(ms)).toBe('2024-01-15');
  });

  it('startOfDay zeroes the clock', () => {
    const ms = new Date(2024, 5, 10, 18, 30, 0).getTime();
    const start = new Date(startOfDay(ms));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it('startOfWeek lands on Monday', () => {
    // Wednesday
    const wed = new Date(2024, 5, 12, 12, 0, 0).getTime();
    const monday = new Date(startOfWeek(wed));
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(10);
  });
});

describe('formatClock (#204)', () => {
  it('ticks mm:ss under an hour and h:mm:ss past it', () => {
    expect(formatClock(22)).toBe('00:22');
    expect(formatClock(59 * 60 + 59)).toBe('59:59');
    expect(formatClock(5400)).toBe('1:30:00');
    expect(formatClock(-3)).toBe('00:00');
  });
});
