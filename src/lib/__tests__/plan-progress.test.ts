import { describe, expect, it } from 'vitest';

import { addDays, planProgress } from '@/lib/plan-progress';

// Monday 2026-11-02, local time.
const MON = new Date(2026, 10, 2).getTime();
const at = (days: number, hour = 18) => addDays(MON, days) + hour * 3_600_000;
// Mon/Wed/Fri for 2 weeks.
const schedule = [1, 2].flatMap((week) => [1, 3, 5].map((day) => ({ week, day })));

describe('planProgress', () => {
  it('marks done, missed, today and upcoming, and counts the streak', () => {
    const p = planProgress({ startedAt: MON, weeks: 2, schedule, workouts: [at(0), at(4), at(7)], now: at(9, 9) });
    expect(p.days.map((d) => d.status)).toEqual(['done', 'missed', 'done', 'done', 'today', 'upcoming']);
    expect(p.week).toBe(2);
    expect(p).toMatchObject({ done: 3, scheduled: 6, due: 5, streak: 2, bestStreak: 2, finished: false });
  });

  it('does not break the streak for today before training', () => {
    const p = planProgress({ startedAt: MON, weeks: 2, schedule, workouts: [at(0), at(2)], now: at(4, 7) });
    expect(p.streak).toBe(2);
  });

  it('aligns weekdays when started mid-week', () => {
    const wed = addDays(MON, 2);
    const p = planProgress({ startedAt: wed, weeks: 1, schedule: [{ week: 1, day: 1 }, { week: 1, day: 3 }], workouts: [], now: wed });
    // Week 1 runs Wed..Tue: Wed is today, Monday falls 5 days later.
    expect(p.days.map((d) => d.date)).toEqual([wed, addDays(wed, 5)]);
  });

  it('counts unscheduled workouts as extra and finishes after the last week', () => {
    const p = planProgress({ startedAt: MON, weeks: 2, schedule, workouts: [at(1), at(0)], now: at(20) });
    expect(p.extra).toBe(1);
    expect(p.finished).toBe(true);
    expect(p.week).toBe(2);
    expect(p.streak).toBe(0);
    expect(p.bestStreak).toBe(1);
  });

  it('treats two routines on one day as one check-in', () => {
    const p = planProgress({ startedAt: MON, weeks: 1, schedule: [{ week: 1, day: 1 }, { week: 1, day: 1 }], workouts: [], now: MON });
    expect(p.scheduled).toBe(1);
  });
});
