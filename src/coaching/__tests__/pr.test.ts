import { describe, expect, it } from 'vitest';

import { estimated1RM } from '@/db/calc';
import {
  allTimeLeaderboard,
  applySetToBests,
  bestsFromPrSummary,
  celebrationEventCount,
  celebrationPrCountByLog,
  collapseRecordsByExercise,
  detectSetRecords,
  emptyExerciseBests,
  foldRecords,
  windowCelebrationPrs,
  type PrSetInput,
} from '../pr';

function set(partial: Partial<PrSetInput> & Pick<PrSetInput, 'exerciseId' | 'weight' | 'reps'>): PrSetInput {
  return {
    completed: true,
    setType: 'working',
    createdAt: 1,
    workoutLogId: 1,
    setIndex: 0,
    ...partial,
  };
}

describe('detectSetRecords', () => {
  it('treats the first working set as every record kind', () => {
    const kinds = detectSetRecords(set({ exerciseId: 1, weight: 80, reps: 5 }), emptyExerciseBests());
    expect(kinds).toEqual(['heaviest_weight', 'estimated_1rm', 'rep_record', 'volume_record']);
  });

  it('skips inaugural lifts when prior history is required', () => {
    const kinds = detectSetRecords(
      set({ exerciseId: 1, weight: 80, reps: 5 }),
      emptyExerciseBests(),
      { requirePriorHistory: true },
    );
    expect(kinds).toEqual([]);
  });

  it('fires heaviest without e1RM when load goes up and reps drop', () => {
    const prior = applySetToBests(emptyExerciseBests(), set({ exerciseId: 1, weight: 80, reps: 8 }));
    const kinds = detectSetRecords(set({ exerciseId: 1, weight: 100, reps: 1 }), prior);
    expect(kinds).toContain('heaviest_weight');
    expect(kinds).not.toContain('estimated_1rm');
  });

  it('fires e1RM without heaviest on a lighter high-rep set', () => {
    const prior = applySetToBests(emptyExerciseBests(), set({ exerciseId: 1, weight: 100, reps: 1 }));
    const kinds = detectSetRecords(set({ exerciseId: 1, weight: 90, reps: 5 }), prior);
    expect(kinds).toContain('estimated_1rm');
    expect(kinds).not.toContain('heaviest_weight');
    expect(estimated1RM(90, 5)).toBeGreaterThan(estimated1RM(100, 1));
  });

  it('ignores warm-ups and incomplete sets', () => {
    const prior = applySetToBests(emptyExerciseBests(), set({ exerciseId: 1, weight: 80, reps: 5 }));
    expect(detectSetRecords(set({ exerciseId: 1, weight: 200, reps: 1, setType: 'warmup' }), prior)).toEqual([]);
    expect(detectSetRecords(set({ exerciseId: 1, weight: 200, reps: 1, completed: false }), prior)).toEqual([]);
  });

  it('ignores drop and failure sets for records (back-offs cannot win)', () => {
    const prior = applySetToBests(emptyExerciseBests(), set({ exerciseId: 1, weight: 80, reps: 5 }));
    expect(detectSetRecords(set({ exerciseId: 1, weight: 200, reps: 1, setType: 'drop' }), prior)).toEqual([]);
    expect(detectSetRecords(set({ exerciseId: 1, weight: 200, reps: 1, setType: 'failure' }), prior)).toEqual([]);
  });

  it('uses in-session bests from a PR summary for live toasts', () => {
    const prior = bestsFromPrSummary({ heaviestWeight: 80, best1RM: 100 });
    const kinds = detectSetRecords(
      set({ exerciseId: 1, weight: 85, reps: 5 }),
      prior,
      { requirePriorHistory: true },
    );
    expect(kinds).toContain('heaviest_weight');
  });
});

describe('foldRecords', () => {
  it('counts a later matching weight as a match, not a second PR', () => {
    const { records } = foldRecords([
      set({ exerciseId: 1, weight: 100, reps: 5, workoutLogId: 1, createdAt: 10 }),
      set({ exerciseId: 1, weight: 100, reps: 5, workoutLogId: 2, createdAt: 20 }),
    ]);
    const celebration = records.filter((r) => r.kinds.includes('heaviest_weight'));
    expect(celebration).toHaveLength(1);
    expect(celebration[0]?.workoutLogId).toBe(1);
  });

  it('collapses session badges to one row per exercise', () => {
    const { records } = foldRecords([
      set({ exerciseId: 1, weight: 80, reps: 5, setIndex: 0, createdAt: 1 }),
      set({ exerciseId: 1, weight: 85, reps: 5, setIndex: 1, createdAt: 2 }),
    ]);
    const collapsed = collapseRecordsByExercise(records);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.kinds).toContain('heaviest_weight');
    expect(collapsed[0]?.weight).toBe(85);
  });

  it('window recap only includes all-time records, not period bests', () => {
    const { records, bests } = foldRecords([
      set({ exerciseId: 1, weight: 100, reps: 5, workoutLogId: 1, createdAt: 1_000 }),
      set({ exerciseId: 1, weight: 90, reps: 5, workoutLogId: 2, createdAt: 2_000 }),
    ]);
    const names = new Map([[1, 'Bench']]);
    const window = windowCelebrationPrs(records, 1_500, 3_000, names);
    expect(window).toHaveLength(0);

    const board = allTimeLeaderboard(records, bests, names);
    expect(board[0]?.maxWeight).toBe(100);
    expect(celebrationEventCount(records)).toBe(1);
    expect(celebrationPrCountByLog(records).get(1)).toBe(1);
    expect(celebrationPrCountByLog(records).get(2) ?? 0).toBe(0);
  });
});
