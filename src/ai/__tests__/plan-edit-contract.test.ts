import { describe, expect, it } from 'vitest';

import { buildPlanEditMessage } from '@/contracts/plans/edit-prompt';
import {
  applyPlanEdit,
  groupWeeks,
  parsePlanEdit,
  parsePlanEditInput,
  samePlan,
  type PlanEditInput,
} from '@/contracts/plans/plan-edit';

// 4 weeks of Mon r1 / Wed r2 / Fri r3; week 4 is a deload on Mon/Wed only.
const input: PlanEditInput = {
  planName: 'Winter Arc',
  weeks: 4,
  routines: [
    { ref: 'r1', name: 'Push', exercises: ['Bench Press', 'Lateral Raise'] },
    { ref: 'r2', name: 'Pull', exercises: ['Barbell Row', 'Biceps Curl'] },
    { ref: 'r3', name: 'Legs', exercises: ['Back Squat', 'Leg Curl'] },
  ],
  schedule: [
    ...[1, 2, 3].flatMap((week) => [
      { week, day: 1, routine: 'r1' },
      { week, day: 3, routine: 'r2' },
      { week, day: 5, routine: 'r3' },
    ]),
    { week: 4, day: 1, routine: 'r1' },
    { week: 4, day: 3, routine: 'r2' },
  ],
  intent: 'Move legs to Saturday',
};

describe('parsePlanEditInput', () => {
  it('accepts a plan and rejects bad refs and out-of-range slots', () => {
    expect(parsePlanEditInput(input).ok).toBe(true);
    expect(parsePlanEditInput({ ...input, routines: [{ ...input.routines[0], ref: 'r2' }] }).ok).toBe(false);
    expect(parsePlanEditInput({ ...input, schedule: [{ week: 5, day: 1, routine: 'r1' }] }).ok).toBe(false);
    expect(parsePlanEditInput({ ...input, schedule: [{ week: 1, day: 1, routine: 'r9' }] }).ok).toBe(false);
  });
});

describe('parsePlanEdit', () => {
  it('reads weekday names, drops unknown exercises and refs, and keeps declines', () => {
    const res = parsePlanEdit(
      {
        summary: 'Legs on Saturday',
        ops: [
          { op: 'moveDay', from: 'Friday', to: 'sat' },
          { op: 'swapExercise', from: 'Deadlift', to: 'RDL' },
          { op: 'swapExercise', from: 'back squat', to: 'Front Squat' },
          { op: 'addDay', day: 'Sun', routine: 'r7' },
          { op: 'setWeeks', count: 4 },
          { op: 'bogus' },
        ],
      },
      input,
    );
    expect(res).toEqual({
      ok: true,
      value: {
        summary: 'Legs on Saturday',
        ops: [
          { op: 'moveDay', from: 5, to: 6 },
          { op: 'swapExercise', from: 'Back Squat', to: 'Front Squat' },
        ],
      },
    });
    expect(parsePlanEdit({ decline: 'See a physio first.' }, input)).toEqual({ ok: true, value: { decline: 'See a physio first.' } });
    expect(parsePlanEdit({ summary: 'x', ops: [{ op: 'bogus' }] }, input).ok).toBe(false);
  });
});

describe('applyPlanEdit', () => {
  it('moves a weekday in every week, trading places when both have training', () => {
    const d = applyPlanEdit(input, [{ op: 'moveDay', from: 1, to: 3 }]);
    expect(d.schedule.filter((s) => s.week === 1)).toEqual([
      { week: 1, day: 1, routine: 'r2' },
      { week: 1, day: 3, routine: 'r1' },
      { week: 1, day: 5, routine: 'r3' },
    ]);
  });

  it('scopes to listed weeks and removes days', () => {
    const d = applyPlanEdit(input, [{ op: 'removeDay', day: 5, weeks: [2] }]);
    expect(d.schedule.filter((s) => s.day === 5).map((s) => s.week)).toEqual([1, 3]);
  });

  it('extends by repeating weeks in order and truncates from the end', () => {
    const longer = applyPlanEdit(input, [{ op: 'setWeeks', count: 6 }]);
    expect(longer.weeks).toBe(6);
    expect(longer.schedule.filter((s) => s.week === 5).map((s) => s.day)).toEqual([1, 3, 5]);
    const shorter = applyPlanEdit(input, [{ op: 'setWeeks', count: 2 }]);
    expect(Math.max(...shorter.schedule.map((s) => s.week))).toBe(2);
  });

  it('adds a day in every week, records swaps, renames', () => {
    const d = applyPlanEdit(input, [
      { op: 'addDay', day: 6, routine: 'r1' },
      { op: 'swapExercise', from: 'Back Squat', to: 'Front Squat' },
      { op: 'rename', name: 'Spring Arc' },
    ]);
    expect(d.schedule.filter((s) => s.day === 6)).toHaveLength(4);
    expect(d.swaps).toEqual([{ routines: ['r3'], from: 'Back Squat', to: 'Front Squat' }]);
    expect(d.name).toBe('Spring Arc');
    expect(samePlan(input, applyPlanEdit(input, []))).toBe(true);
  });
});

describe('prompt', () => {
  it('groups identical weeks', () => {
    expect(groupWeeks(input.schedule, 4).map((g) => [g.from, g.to])).toEqual([
      [1, 3],
      [4, 4],
    ]);
    const msg = buildPlanEditMessage(input);
    expect(msg).toContain('Weeks 1–3: Mon r1, Wed r2, Fri r3');
    expect(msg).toContain('Week 4: Mon r1, Wed r2');
    expect(msg).toContain('r3: Legs — Back Squat, Leg Curl');
  });
});
