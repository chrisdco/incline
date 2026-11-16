import { describe, expect, it } from 'vitest';

import type { PeriodStats } from '@/db/types';

import { periodHeadline } from '../period-headline';

const base: PeriodStats = {
  range: '30d',
  sessions: 0,
  totalVolume: 0,
  totalSets: 0,
  streak: 0,
  weeklyVolume: [],
  monthlyVolume: [],
  dailyVolume: [],
  muscleDistribution: [],
  previousMuscleDistribution: [],
  prs: [],
  trend: null,
};

describe('periodHeadline', () => {
  it('says when nothing happened', () => {
    expect(periodHeadline(base, '30d')).toBe('No workouts in the last 30 days yet.');
  });
  it('joins sessions, records, trend and top muscle', () => {
    const s: PeriodStats = {
      ...base,
      sessions: 9,
      prs: [{ exerciseId: 1, exerciseName: 'Bench', maxWeight: 100, maxReps: 5, estimated1RM: 115, bestSetVolume: 500, achievedAt: 0 }],
      trend: { volumeDelta: 12, sessionsDelta: 0 },
      muscleDistribution: [
        { muscle: 'back', sets: 30, volume: 0 },
        { muscle: 'chest', sets: 40, volume: 0 },
      ],
    };
    expect(periodHeadline(s, '30d')).toBe(
      "9 sessions in the last 30 days, 1 record, this week's volume up 12% on last week. Most work went to chest.",
    );
  });
});
