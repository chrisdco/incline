import { describe, expect, it } from 'vitest';

import type { ProgressStats } from '@/db/types';
import { evaluateAchievements } from '@/lib/achievements';
import { LB_PER_KG } from '@/lib/units';

function stats(totalVolumeKg: number): ProgressStats {
  return {
    totalSessions: 3,
    totalVolume: totalVolumeKg,
    totalSets: 30,
    streak: 1,
    weeklyVolume: [],
    muscleDistribution: [],
    prs: [],
    prEventCount: 0,
    lastSessionAt: null,
  };
}

const volume10k = (unit: 'metric' | 'imperial', kg: number) =>
  evaluateAchievements(stats(kg), unit).find((a) => a.id === 'volume_10k')!;

describe('volume milestones (canonical kg thresholds)', () => {
  it('unlocks at 10,000 kg in either display unit', () => {
    expect(volume10k('metric', 10_000).unlocked).toBe(true);
    expect(volume10k('imperial', 10_000).unlocked).toBe(true);
    expect(volume10k('metric', 9_999).unlocked).toBe(false);
    expect(volume10k('imperial', 9_999).unlocked).toBe(false);
  });

  it('does not unlock on 10,000 lb (4,536 kg) just because the user shows pounds', () => {
    const kg = 10_000 / LB_PER_KG;
    const lb = volume10k('imperial', kg);
    expect(lb.unlocked).toBe(false);
    expect(lb.progress).toBeCloseTo(kg / 10_000, 5);
  });

  it('shows current and target in the display unit', () => {
    const metric = volume10k('metric', 5_000);
    expect(metric.current).toBe(5_000);
    expect(metric.target).toBe(10_000);
    expect(metric.description).toBe('Move 10,000 kg of total volume');

    const imperial = volume10k('imperial', 5_000);
    expect(imperial.current).toBe(Math.floor(5_000 * LB_PER_KG));
    expect(imperial.target).toBe(22_046);
    expect(imperial.description).toBe('Move 22,046 lb of total volume');
  });

  it('progress is the same whichever unit is shown', () => {
    expect(volume10k('metric', 2_500).progress).toBe(volume10k('imperial', 2_500).progress);
  });

  it('leaves unit-free milestones alone', () => {
    const first = evaluateAchievements(stats(0), 'imperial').find((a) => a.id === 'first_session')!;
    expect(first.target).toBe(1);
    expect(first.current).toBe(3);
    expect(first.unlocked).toBe(true);
  });

  it('reports everything locked with no stats', () => {
    expect(evaluateAchievements(null, 'imperial').every((a) => !a.unlocked && a.current === 0)).toBe(true);
  });
});
