import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/queries/programs', () => ({ insertPlan: vi.fn(), softDeletePlan: vi.fn(), PLAN_TABLES: [] }));

import { buildPlanProposal, type ResolvedPlanExercise } from '@/ai/plan-build-client';
import { parsePlanInsertPayload } from '@/ai/plan-actions';
import { parsePlanDraft, stubPlanDraft, type PlanBuildInput } from '@/contracts/plans/plan-build';
import { EXERCISES } from '@/db/seed';

const base: PlanBuildInput = { intent: 'Winter Arc', weeks: 4, daysPerWeek: 4, goal: 'hypertrophy', experience: 'intermediate', minutes: 60 };

const catalog = new Map<string, ResolvedPlanExercise | null>(
  EXERCISES.map((e, i) => [e.name, { id: i + 1, name: e.name, primaryMuscle: e.primaryMuscle, secondaryMuscles: e.secondaryMuscles }]),
);

function draftFor(input: PlanBuildInput) {
  const d = parsePlanDraft(stubPlanDraft(input), input);
  if (!d.ok || 'decline' in d.value) throw new Error('stub did not parse');
  return d.value;
}

describe('buildPlanProposal', () => {
  it('schedules every week, using deload routines in deload weeks', () => {
    const p = buildPlanProposal(base, draftFor(base), catalog, 'p1');
    expect(p.payload).not.toBeNull();
    const payload = p.payload!;
    expect(payload.templates).toHaveLength(8);
    expect(payload.schedule).toHaveLength(16);
    const wk4 = payload.schedule.filter((s) => s.week === 4).map((s) => payload.templates[s.template]!.name);
    expect(wk4.every((n) => n.endsWith('(Deload)'))).toBe(true);
    expect(payload.schedule.filter((s) => s.week === 1).map((s) => s.day)).toEqual([1, 2, 4, 5]);
    expect(p.warnings).toEqual([]);
    expect(parsePlanInsertPayload(payload).ok).toBe(true);
  });
  it('drops unmatched names and lists them', () => {
    const draft = draftFor(base);
    const first = draft.days[0]!;
    const slot = Object.keys(first.fills)[1]!;
    first.fills[slot] = 'Moon Press';
    const p = buildPlanProposal(base, draft, catalog, 'p2');
    expect(p.unresolved).toEqual(['Moon Press']);
    expect(p.days[0]!.rows.some((r) => r.exercise === 'Moon Press')).toBe(false);
  });
  it('has no deload routines for a 1-week plan', () => {
    const input = { ...base, weeks: 1 };
    const p = buildPlanProposal(input, draftFor(input), catalog, 'p3');
    expect(p.payload!.templates).toHaveLength(4);
    expect(p.payload!.schedule).toHaveLength(4);
  });
});

describe('parsePlanInsertPayload', () => {
  it('rejects slots past the plan length and bad template refs', () => {
    const p = buildPlanProposal(base, draftFor(base), catalog, 'p4').payload!;
    expect(parsePlanInsertPayload({ ...p, schedule: [{ week: 5, day: 1, template: 0 }] }).ok).toBe(false);
    expect(parsePlanInsertPayload({ ...p, schedule: [{ week: 1, day: 1, template: 99 }] }).ok).toBe(false);
    expect(parsePlanInsertPayload({ ...p, schedule: [...p.schedule, p.schedule[0]] }).ok).toBe(false);
  });
});
