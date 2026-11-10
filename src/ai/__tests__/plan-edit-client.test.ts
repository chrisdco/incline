import { describe, expect, it } from 'vitest';

import { buildPlanEditProposal, planEditContext, routineLabel } from '@/ai/plan-edit-client';
import type { Program } from '@/db/types';

const program: Program = {
  id: 7,
  name: 'Winter Arc',
  description: '',
  weeks: 2,
  isCustom: true,
  createdAt: 0,
  updatedAt: 0,
  workouts: [1, 2].flatMap((week) => [
    { id: week * 10 + 1, programId: 7, templateId: 101, week, day: 1, sortOrder: 0, templateName: 'Winter Arc: Upper' },
    { id: week * 10 + 4, programId: 7, templateId: 102, week, day: 4, sortOrder: 0, templateName: 'Winter Arc: Lower' },
  ]),
};
const rows = [
  { templateId: 101, exerciseId: 1, name: 'Bench Press' },
  { templateId: 101, exerciseId: 2, name: 'Barbell Row' },
  { templateId: 102, exerciseId: 3, name: 'Back Squat' },
];

describe('planEditContext', () => {
  it('numbers routines in schedule order and strips the plan prefix', () => {
    const ctx = planEditContext(program, rows, 'x');
    expect(ctx.input.routines).toEqual([
      { ref: 'r1', name: 'Upper', exercises: ['Bench Press', 'Barbell Row'] },
      { ref: 'r2', name: 'Lower', exercises: ['Back Squat'] },
    ]);
    expect(ctx.input.schedule).toHaveLength(4);
    expect(routineLabel('Winter Arc', 'Winter Arc: ')).toBe('Winter Arc: ');
  });
});

describe('buildPlanEditProposal', () => {
  const ctx = planEditContext(program, rows, 'x');

  it('builds the slot payload and marks changed schedule lines', () => {
    const p = buildPlanEditProposal(ctx, { summary: 'Lower on Friday', ops: [{ op: 'moveDay', from: 4, to: 5 }] }, new Map(), 'p1');
    expect(p.schedule).toEqual([{ label: 'Weeks 1–2', days: 'Mon Upper · Fri Lower', changed: true }]);
    expect(p.payload?.slots).toEqual([
      { week: 1, day: 1, templateId: 101 },
      { week: 1, day: 5, templateId: 102 },
      { week: 2, day: 1, templateId: 101 },
      { week: 2, day: 5, templateId: 102 },
    ]);
  });

  it('resolves swaps, skips ones already in the routine, lists unresolved', () => {
    const resolved = new Map([
      ['Front Squat', { id: 9, name: 'Front Squat' }],
      ['Mystery Lift', null],
    ]);
    const p = buildPlanEditProposal(
      ctx,
      {
        summary: 's',
        ops: [
          { op: 'swapExercise', from: 'Back Squat', to: 'Front Squat' },
          { op: 'swapExercise', from: 'Bench Press', to: 'Mystery Lift' },
        ],
      },
      resolved,
      'p2',
    );
    expect(p.schedule).toBeNull();
    expect(p.swaps).toEqual([{ from: 'Back Squat', to: 'Front Squat', routines: ['Lower'] }]);
    expect(p.unresolved).toEqual(['Mystery Lift']);
    expect(p.payload?.swaps).toEqual([{ templateId: 102, fromExerciseId: 3, toExerciseId: 9 }]);

    const noop = buildPlanEditProposal(
      ctx,
      { summary: 's', ops: [{ op: 'swapExercise', from: 'Bench Press', to: 'Barbell Row' }] },
      new Map([['Barbell Row', { id: 2, name: 'Barbell Row' }]]),
      'p3',
    );
    expect(noop.payload).toBeNull();
  });
});
