import { describe, expect, it } from 'vitest';

import {
  ALL_EQUIPMENT,
  ALL_MUSCLES,
  ALL_PATTERNS,
  filterRoutineSummaries,
  sortRoutineSummaries,
} from '../exercise-filters';
import type { TemplateSummary } from '@/db/queries';

function summary(
  id: number,
  name: string,
  opts?: { updatedAt?: number; exercises?: string[]; description?: string },
): TemplateSummary {
  return {
    template: {
      id,
      name,
      description: opts?.description ?? '',
      category: 'strength',
      difficulty: 'intermediate',
      estimatedMinutes: 45,
      isCustom: true,
      uuid: null,
      createdAt: 1,
      updatedAt: opts?.updatedAt ?? 1,
    },
    exerciseCount: opts?.exercises?.length ?? 0,
    muscleFocus: [],
    exerciseNames: opts?.exercises ?? [],
  } as TemplateSummary;
}

describe('exercise filter options', () => {
  it('covers every known muscle, equipment, and pattern', () => {
    expect(ALL_MUSCLES).toContain('glutes');
    expect(ALL_MUSCLES).toContain('traps');
    expect(ALL_MUSCLES).toContain('forearms');
    expect(ALL_MUSCLES).toContain('calves');
    expect(ALL_EQUIPMENT).toHaveLength(8);
    expect(ALL_PATTERNS).toHaveLength(8);
  });
});

describe('filterRoutineSummaries', () => {
  const items = [
    summary(1, 'Push Day', { exercises: ['Bench Press', 'Overhead Press'] }),
    summary(2, 'Pull Day', { exercises: ['Deadlift'] }),
    summary(3, 'Leg Day', { description: 'Squat focus' }),
  ];

  it('matches across name, description, and exercise names', () => {
    expect(filterRoutineSummaries(items, 'push').map((i) => i.template.id)).toEqual([1]);
    expect(filterRoutineSummaries(items, 'bench').map((i) => i.template.id)).toEqual([1]);
    expect(filterRoutineSummaries(items, 'squat').map((i) => i.template.id)).toEqual([3]);
  });

  it('requires every token and ignores case', () => {
    expect(filterRoutineSummaries(items, 'DAY PUSH').map((i) => i.template.id)).toEqual([1]);
    expect(filterRoutineSummaries(items, 'day yoga')).toEqual([]);
  });

  it('returns everything on empty query', () => {
    expect(filterRoutineSummaries(items, '  ')).toHaveLength(3);
  });
});

describe('sortRoutineSummaries', () => {
  const items = [
    summary(1, 'Zebra', { updatedAt: 10 }),
    summary(2, 'Apple', { updatedAt: 30 }),
    summary(3, 'Mango', { updatedAt: 20 }),
  ];

  it('sorts A–Z by name', () => {
    expect(sortRoutineSummaries(items, 'name').map((i) => i.template.id)).toEqual([2, 3, 1]);
  });

  it('sorts recently-modified first', () => {
    expect(sortRoutineSummaries(items, 'recent').map((i) => i.template.id)).toEqual([2, 3, 1]);
  });

  it('does not mutate the input', () => {
    const copy = [...items];
    sortRoutineSummaries(items, 'name');
    expect(items.map((i) => i.template.id)).toEqual(copy.map((i) => i.template.id));
  });
});
