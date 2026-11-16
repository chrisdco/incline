import { describe, expect, it } from 'vitest';

import type { MuscleDistribution, MuscleGroup } from '@/db/types';

import { reviewMuscles } from '../muscle-review';

const dist = (o: Partial<Record<MuscleGroup, number>>): MuscleDistribution[] =>
  Object.entries(o).map(([muscle, sets]) => ({ muscle: muscle as MuscleGroup, sets: sets!, volume: 0 }));

describe('reviewMuscles', () => {
  it('returns null with no training', () => {
    expect(reviewMuscles({ range: '30d', current: [], previous: [] })).toBeNull();
  });

  it('covers several angles at once, problems first', () => {
    const r = reviewMuscles({
      range: '1w',
      current: dist({ chest: 16, shoulders: 10, triceps: 8, back: 6, biceps: 4, quads: 3 }),
      previous: dist({ chest: 8, back: 10 }),
      exposureDays: { hamstrings: 12 },
    })!;
    const ids = r.points.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['volume_low', 'push_pull', 'upper_lower', 'change', 'untrained', 'volume_ok']));
    expect(r.points[0]!.tone).toBe('act');
    expect(r.points.at(-1)!.tone).toBe('good');
    expect(r.points.find((p) => p.id === 'push_pull')!.title).toBe('More pushing than pulling');
    // Hamstrings is already "not trained this period"; not repeated as a gap.
    expect(ids).not.toContain('recovery_gap');
  });

  it('calls a balanced week balanced', () => {
    const r = reviewMuscles({
      range: '1w',
      current: dist({ chest: 12, back: 12, shoulders: 10, biceps: 10, triceps: 10, quads: 12, hamstrings: 10, glutes: 10, calves: 10 }),
      previous: [],
    })!;
    expect(r.points.every((p) => p.tone === 'good')).toBe(true);
    expect(r.summary).toMatch(/^Balanced/);
  });

  it('skips per-week guidance for all time', () => {
    const r = reviewMuscles({ range: 'all', current: dist({ chest: 40, back: 40, quads: 40 }), previous: [] })!;
    expect(r.points.some((p) => p.id.startsWith('volume'))).toBe(false);
  });
});
