import { describe, expect, it } from 'vitest';

import { shapeTrainingSummary, type NormSet } from '@/contracts/mcp/shape';

const NOW = Date.parse('2026-11-17T12:00:00Z');
const set = (muscle: string, daysAgo: number, i: number): NormSet => ({
  logId: `w${daysAgo}`,
  startedAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
  exerciseKey: `${muscle}-${i}`,
  exercise: muscle,
  weightKg: 60,
  reps: 8,
  primaryMuscle: muscle,
  secondaryMuscles: [],
});

describe('shapeTrainingSummary review (MCP + Ask parity)', () => {
  it('carries the same muscle review the app shows', () => {
    const sets = [
      ...Array.from({ length: 12 }, (_, i) => set('chest', 2, i)),
      ...Array.from({ length: 3 }, (_, i) => set('back', 3, i)),
    ];
    const out = shapeTrainingSummary(sets, 1, NOW);
    const ids = out.review!.points.map((p) => p.id);
    expect(ids).toContain('push_pull');
    expect(ids).toContain('upper_lower');
    expect(out.review!.ruleVersion).toBe('muscle-review-1');
  });
});
