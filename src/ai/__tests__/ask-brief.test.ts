import { describe, expect, it } from 'vitest';

import type { NormSet } from '@/contracts/mcp/shape';
import { hashSeed, sceneDots, weekKey } from '@/components/ai/ask-scenes';

import { buildAskBrief } from '../ask-brief';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-12T12:00:00Z');

function set(daysAgo: number, exercise: string, weightKg: number, reps = 5, muscle = 'chest', log?: string): NormSet {
  return {
    logId: log ?? `log-${daysAgo}`,
    startedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    exerciseKey: exercise,
    exercise,
    weightKg,
    reps,
    primaryMuscle: muscle,
    secondaryMuscles: [],
  };
}

describe('Ask idle brief', () => {
  it('stays in the starter state under 3 sessions, with no invented insights', () => {
    const b = buildAskBrief([set(1, 'Bench', 100), set(3, 'Bench', 105)], 'metric', NOW);
    expect(b).toMatchObject({ scene: 'fresh', cards: [], sessions: 2 });
  });

  it('leads with a new best this week, numbers from our calc', () => {
    const sets = [set(20, 'Bench', 90), set(14, 'Bench', 92.5), set(7.5, 'Bench', 92.5), set(1, 'Bench', 100)];
    const b = buildAskBrief(sets, 'metric', NOW);
    expect(b.scene).toBe('rise');
    expect(b.headline).toBe('New best on Bench');
    expect(b.cards[0]).toMatchObject({
      kind: 'pr',
      question: "What's driving my bench progress?",
    });
    expect(b.cards[0]!.metric).toMatch(/^Bench e1RM [\d.]+ kg → [\d.]+ kg$/);
  });

  it('calls a stall only with 4+ sessions, flat within 1%', () => {
    const flat = [set(30, 'Squat', 120), set(22, 'Squat', 120), set(15, 'Squat', 120), set(8, 'Squat', 120), set(2, 'Squat', 120)];
    const b = buildAskBrief(flat, 'metric', NOW);
    expect(b.cards.map((c) => c.kind)).toContain('stalled');
    expect(b.cards.find((c) => c.kind === 'stalled')!.question).toBe('Why has my squat stalled?');
  });

  it('flags a break after 7+ days and converts to lb', () => {
    const sets = [set(40, 'Row', 60, 5, 'back'), set(30, 'Row', 60, 5, 'back'), set(10, 'Row', 60, 5, 'back')];
    const b = buildAskBrief(sets, 'imperial', NOW);
    expect(b.headline).toBe('10 days since your last workout');
    expect(b.scene).toBe('gap');
  });

  it('spots a major muscle far below the floor when another is trained to it', () => {
    const sets: NormSet[] = [];
    for (let w = 0; w < 4; w++) {
      for (let k = 0; k < 12; k++) sets.push(set(w * 7 + 1, 'Bench', 80 + k * 0.01, 8, 'chest', `l${w}`));
      sets.push(set(w * 7 + 1, 'Row', 60, 8, 'back', `l${w}`));
    }
    const b = buildAskBrief(sets, 'metric', NOW);
    expect(b.cards.map((c) => c.kind)).toContain('balance');
  });
});

describe('dither scenes', () => {
  it('are deterministic for a seed and differ across seeds', () => {
    const a = sceneDots('rise', 42);
    expect(sceneDots('rise', 42)).toEqual(a);
    expect(sceneDots('rise', 43)).not.toEqual(a);
    expect(a.bands.length).toBeGreaterThan(0);
  });

  it('seed is stable within a week', () => {
    expect(weekKey(new Date('2026-11-10T08:00:00'))).toBe(weekKey(new Date('2026-11-12T20:00:00')));
    expect(weekKey(new Date('2026-11-12'))).not.toBe(weekKey(new Date('2026-11-20')));
    expect(hashSeed('rise:2026-W46')).toBe(hashSeed('rise:2026-W46'));
  });
});
