import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { countLocalDays, localDayKey } from '@/lib/consistency';

/** The bucketing #150 replaced: whole UTC days since the epoch. */
function utcDayCount(startedAts: number[]): number {
  return new Set(startedAts.map((t) => Math.floor(t / 86_400_000))).size;
}

const ORIGINAL_TZ = process.env.TZ;

function withTz(tz: string, run: () => void) {
  describe(tz, () => {
    beforeAll(() => {
      process.env.TZ = tz;
    });
    run();
  });
}

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

withTz('America/Los_Angeles', () => {
  it('keys by the local calendar day, not the UTC one', () => {
    // 23:30 local on 10 Mar is 06:30Z on 11 Mar.
    const lateNight = new Date(2026, 2, 10, 23, 30).getTime();
    expect(localDayKey(lateNight)).toBe('2026-03-10');
  });

  it('counts two sessions either side of local midnight as two days', () => {
    const before = new Date(2026, 2, 10, 23, 30).getTime();
    const after = new Date(2026, 2, 11, 0, 30).getTime();
    expect(countLocalDays([before, after])).toBe(2);
    expect(utcDayCount([before, after])).toBe(1); // the old bug
  });

  it('counts an early and a late session on one local day once', () => {
    const early = new Date(2026, 2, 11, 0, 10).getTime();
    const late = new Date(2026, 2, 11, 23, 50).getTime();
    expect(countLocalDays([early, late])).toBe(1);
    expect(utcDayCount([early, late])).toBe(2); // the old bug
  });
});

withTz('Pacific/Auckland', () => {
  it('handles zones ahead of UTC', () => {
    // 08:00 local on 5 Jan is 19:00Z on 4 Jan.
    const morning = new Date(2026, 0, 5, 8, 0).getTime();
    const evening = new Date(2026, 0, 5, 20, 0).getTime();
    expect(localDayKey(morning)).toBe('2026-01-05');
    expect(countLocalDays([morning, evening])).toBe(1);
  });
});

describe('countLocalDays', () => {
  it('is zero for no sessions', () => {
    expect(countLocalDays([])).toBe(0);
  });
});
