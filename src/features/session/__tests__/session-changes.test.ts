import { describe, expect, it } from 'vitest';

import {
  countsAsRoutineSet,
  describeRoutineChange,
  diffSessionAgainstRoutine,
  nextRoutineRows,
  type RoutineSlot,
  type SessionSlot,
} from '@/contracts/templates/session-changes';

const routine: RoutineSlot[] = [
  { exerciseId: 1, name: 'Bench Press', sets: 3, restSeconds: 120 },
  { exerciseId: 2, name: 'Row', sets: 3, restSeconds: 90 },
  { exerciseId: 3, name: 'Curl', sets: 2, restSeconds: 60 },
];

function slot(exerciseId: number, over: Partial<SessionSlot> = {}): SessionSlot {
  const r = routine.find((x) => x.exerciseId === exerciseId);
  return {
    exerciseId,
    name: r?.name ?? `Ex ${exerciseId}`,
    workingSets: r?.sets ?? 3,
    avgReps: 10,
    restSeconds: r?.restSeconds ?? 90,
    skipped: false,
    ...over,
  };
}

describe('diffSessionAgainstRoutine', () => {
  it('finds nothing when the workout matches the routine', () => {
    expect(diffSessionAgainstRoutine(routine, [slot(1), slot(2), slot(3)])).toEqual({ changes: [], structural: false });
  });

  it('treats a rest tweak alone as non-structural', () => {
    const diff = diffSessionAgainstRoutine(routine, [slot(1, { restSeconds: 150 }), slot(2), slot(3)]);
    expect(diff.structural).toBe(false);
    expect(diff.changes).toEqual([{ kind: 'rest', exerciseId: 1, name: 'Bench Press', from: 120, to: 150 }]);
  });

  it('counts added and removed exercises, set counts and order as structural', () => {
    const diff = diffSessionAgainstRoutine(routine, [
      slot(2),
      slot(1, { workingSets: 4 }),
      slot(9, { name: 'Dip', workingSets: 2 }),
    ]);
    expect(diff.structural).toBe(true);
    expect(diff.changes.map((c) => c.kind).sort()).toEqual(['added', 'order', 'removed', 'sets']);
  });

  it('never counts a skipped exercise, its sets or its rest', () => {
    const diff = diffSessionAgainstRoutine(routine, [
      slot(1, { skipped: true, workingSets: 1, restSeconds: 30 }),
      slot(2),
      slot(3),
    ]);
    expect(diff).toEqual({ changes: [], structural: false });
  });

  it('ignores an added exercise with only warm-ups', () => {
    const diff = diffSessionAgainstRoutine(routine, [slot(1), slot(2), slot(3), slot(9, { workingSets: 0 })]);
    expect(diff.changes).toEqual([]);
  });
});

describe('nextRoutineRows', () => {
  it('follows workout order, keeps skipped rows and seeds added rep ranges', () => {
    const session = [
      slot(2, { restSeconds: 75 }),
      slot(1, { skipped: true, workingSets: 1 }),
      slot(9, { name: 'Dip', workingSets: 2, avgReps: 12, restSeconds: null }),
    ];
    const diff = diffSessionAgainstRoutine(routine, session);
    expect(nextRoutineRows(routine, session, diff, 90)).toEqual([
      { exerciseId: 2, sets: 3, restSeconds: 75, warmups: 0 },
      { exerciseId: 1, sets: 3, restSeconds: 120, warmups: 0 },
      { exerciseId: 9, sets: 2, repsMin: 10, repsMax: 14, restSeconds: 90, warmups: 0 },
    ]);
  });

  it('carries warm-ups: done exercises take today\'s count, skipped keep the routine\'s', () => {
    const withW: RoutineSlot[] = [
      { ...routine[0], warmups: 2 },
      { ...routine[1], warmups: 1 },
    ];
    const session = [slot(1, { warmupSets: 1 }), slot(2, { skipped: true })];
    const diff = diffSessionAgainstRoutine(withW, session);
    expect(nextRoutineRows(withW, session, diff, 90)).toEqual([
      { exerciseId: 1, sets: 3, restSeconds: 120, warmups: 1 },
      { exerciseId: 2, sets: 3, restSeconds: 90, warmups: 1 },
    ]);
  });
});

describe('warm-ups on the routine', () => {
  it('a changed warm-up count is structural and leaves the set count alone', () => {
    const diff = diffSessionAgainstRoutine(routine, [slot(1, { warmupSets: 2 }), slot(2), slot(3)]);
    expect(diff.structural).toBe(true);
    expect(diff.changes).toEqual([{ kind: 'warmups', exerciseId: 1, name: 'Bench Press', from: 0, to: 2 }]);
  });

  it('removing all warm-ups is a change; an exercise not done says nothing', () => {
    const withW: RoutineSlot[] = routine.map((r) => ({ ...r, warmups: 1 }));
    const diff = diffSessionAgainstRoutine(withW, [
      slot(1, { warmupSets: 0 }),
      slot(2, { warmupSets: 1 }),
      slot(3, { workingSets: 0, warmupSets: 0 }),
    ]);
    expect(diff.changes).toEqual([{ kind: 'warmups', exerciseId: 1, name: 'Bench Press', from: 1, to: 0 }]);
  });

  it('an added exercise brings its warm-ups', () => {
    const diff = diffSessionAgainstRoutine(routine, [slot(1), slot(2), slot(3), slot(9, { name: 'Dip', workingSets: 3, warmupSets: 1 })]);
    expect(diff.changes).toEqual([{ kind: 'added', exerciseId: 9, name: 'Dip', sets: 3, warmups: 1 }]);
    expect(describeRoutineChange(diff.changes[0])).toBe('Added Dip (1 warm-up + 3 sets)');
  });

  it('describes warm-up changes', () => {
    expect(describeRoutineChange({ kind: 'warmups', exerciseId: 1, name: 'Bench', from: 0, to: 2 })).toBe('Bench: 2 warm-ups (was 0)');
    expect(describeRoutineChange({ kind: 'warmups', exerciseId: 1, name: 'Bench', from: 2, to: 0 })).toBe('Bench: no warm-ups (was 2)');
  });
});

describe('helpers', () => {
  it('counts working and failure sets only', () => {
    expect(['working', 'failure', 'warmup', 'drop', null].map(countsAsRoutineSet)).toEqual([true, true, false, false, true]);
  });

  it('describes changes in plain words', () => {
    expect(describeRoutineChange({ kind: 'added', exerciseId: 9, name: 'Dip', sets: 1 })).toBe('Added Dip (1 set)');
    expect(describeRoutineChange({ kind: 'rest', exerciseId: 1, name: 'Bench', from: 90, to: 0 })).toBe('Bench: rest off (was 1:30)');
  });
});
