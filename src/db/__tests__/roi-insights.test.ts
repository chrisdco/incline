import { describe, expect, it } from 'vitest';

import { evaluateAchievements } from '../../lib/achievements';
import { weekInsightFromStats } from '../../lib/week-insight';
import type { ProgressStats } from '../types';

function stats(partial: Partial<ProgressStats>): ProgressStats {
  return {
    totalSessions: 0,
    totalVolume: 0,
    totalSets: 0,
    streak: 0,
    weeklyVolume: [],
    muscleDistribution: [],
    prs: [],
    prEventCount: 0,
    lastSessionAt: null,
    ...partial,
  };
}

describe('evaluateAchievements', () => {
  it('unlocks first session and tracks progress', () => {
    const list = evaluateAchievements(stats({ totalSessions: 1, totalVolume: 500, streak: 1 }));
    expect(list.find((a) => a.id === 'first_session')?.unlocked).toBe(true);
    expect(list.find((a) => a.id === 'sessions_10')?.unlocked).toBe(false);
    expect(list.find((a) => a.id === 'sessions_10')?.progress).toBe(0.1);
  });

  it('uses PR event count rather than unique exercises', () => {
    const list = evaluateAchievements(
      stats({
        prs: [{ exerciseId: 1, exerciseName: 'Squat', maxWeight: 100, maxReps: 5, estimated1RM: 116, bestSetVolume: 500, achievedAt: 1 }],
        prEventCount: 5,
      }),
    );
    expect(list.find((a) => a.id === 'prs_5')?.unlocked).toBe(true);
    expect(list.find((a) => a.id === 'prs_5')?.current).toBe(5);
  });
});

describe('weekInsightFromStats', () => {
  it('builds a readable week line with volume delta and PRs', () => {
    const now = Date.now();
    const insight = weekInsightFromStats(
      stats({
        totalSessions: 4,
        weeklyVolume: [
          { weekStart: 'prev', volume: 1000, sessions: 2 },
          { weekStart: 'curr', volume: 1200, sessions: 3 },
        ],
        prs: [{ exerciseId: 1, exerciseName: 'Squat', maxWeight: 100, maxReps: 5, estimated1RM: 116, bestSetVolume: 500, achievedAt: now }],
      }),
      'metric',
    );
    expect(insight?.sessions).toBe(3);
    expect(insight?.prsThisWeek).toBe(1);
    expect(insight?.volumeDeltaPct).toBe(20);
    expect(insight?.line).toContain('This week');
    expect(insight?.line).toContain('3 sessions');
  });
});

describe('weekInsightFromStats mid-week (no fake drop)', () => {
  const weeks = [
    { weekStart: 'prev', volume: 2000, sessions: 4 },
    { weekStart: 'curr', volume: 1200, sessions: 2 },
  ];
  it('hides a negative delta while the week is still running', () => {
    const insight = weekInsightFromStats(stats({ totalSessions: 6, weeklyVolume: weeks }), 'metric');
    expect(insight?.volumeDeltaPct).toBeNull();
    expect(insight?.line).not.toContain('% vol');
  });
  it('still shows being ahead mid-week', () => {
    const ahead = [weeks[0], { weekStart: 'curr', volume: 2400, sessions: 3 }];
    expect(weekInsightFromStats(stats({ totalSessions: 7, weeklyVolume: ahead }), 'metric')?.volumeDeltaPct).toBe(20);
  });
});
