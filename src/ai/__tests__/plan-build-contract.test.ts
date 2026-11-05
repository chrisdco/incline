import { describe, expect, it } from 'vitest';

import {
  assemblePlan,
  balanceVolume,
  deloadDay,
  parsePlanBuildInput,
  parsePlanDraft,
  planDescription,
  planSkeleton,
  stubPlanDraft,
  type MuscleInfo,
  type PlanBuildInput,
} from '@/contracts/plans/plan-build';
import { buildUserMessage } from '@/contracts/plans/prompt';
import { deloadWeeks, SPLITS, weekPlan } from '@/contracts/plans/rules';
import { EXERCISES } from '@/db/seed';

const base: PlanBuildInput = { intent: '', weeks: 4, daysPerWeek: 4, goal: 'hypertrophy', experience: 'intermediate', minutes: 60 };

const SEED_MUSCLES = new Map(EXERCISES.map((e) => [e.name, { primary: e.primaryMuscle, secondary: e.secondaryMuscles } as MuscleInfo]));

function stubPlan(input: PlanBuildInput) {
  const draft = parsePlanDraft(stubPlanDraft(input), input);
  if (!draft.ok || 'decline' in draft.value) throw new Error('stub did not parse');
  const plan = assemblePlan(input, draft.value);
  return { ...plan, days: plan.days.map((d) => ({ ...d, rows: d.rows.map((r) => ({ ...r, muscles: SEED_MUSCLES.get(r.exercise) ?? null })) })) };
}

describe('rules', () => {
  it('every split trains each major muscle at least twice a week', () => {
    const touches: Record<string, string[]> = {
      squat: ['quads', 'glutes'],
      hinge: ['hamstrings', 'glutes'],
      single_leg: ['quads', 'glutes'],
      horizontal_push: ['chest'],
      horizontal_pull: ['back'],
      vertical_pull: ['back'],
      vertical_push: ['shoulders'],
      side_delts: ['shoulders'],
      rear_delts: ['shoulders'],
    };
    for (const [days, split] of Object.entries(SPLITS)) {
      const count: Record<string, number> = {};
      for (const d of split) {
        const hit = new Set(d.slots.flatMap(([f]) => touches[f] ?? []));
        for (const m of hit) count[m] = (count[m] ?? 0) + 1;
      }
      for (const m of ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes']) {
        expect(count[m], `${m} in ${days}-day split`).toBeGreaterThanOrEqual(2);
      }
    }
  });
  it('places deloads by length and level', () => {
    expect(deloadWeeks(1, 'intermediate')).toEqual([]);
    expect(deloadWeeks(4, 'intermediate')).toEqual([4]);
    expect(deloadWeeks(4, 'beginner')).toEqual([]);
    expect(deloadWeeks(6, 'beginner')).toEqual([6]);
    expect(deloadWeeks(8, 'advanced')).toEqual([4, 8]);
    expect(deloadWeeks(12, 'intermediate')).toEqual([4, 8, 12]);
  });
  it('ramps effort from ~3 to ~1 reps in reserve inside each block', () => {
    expect(weekPlan(4, 'intermediate').map((w) => `${w.kind}:${w.rir}`)).toEqual(['build:3', 'build:2', 'build:1', 'deload:3']);
    expect(weekPlan(8, 'advanced').map((w) => w.rir)).toEqual([3, 2, 1, 3, 3, 2, 1, 3]);
    expect(weekPlan(1, 'beginner')).toEqual([{ week: 1, kind: 'build', rir: 2 }]);
  });
});

describe('planSkeleton', () => {
  it('fits every day to the time budget', () => {
    const sk = planSkeleton({ ...base, minutes: 30, daysPerWeek: 3 });
    for (const d of sk.days) {
      expect(d.slots.reduce((n, s) => n + s.sets, 0)).toBeLessThanOrEqual(10);
      expect(d.slots.length).toBeGreaterThanOrEqual(4);
      expect(d.slots[0]!.role).toBe('main');
    }
  });
  it('uses heavy, low-rep main lifts for strength', () => {
    const main = planSkeleton({ ...base, goal: 'strength' }).days[0]!.slots[0]!;
    expect([main.repsMin, main.repsMax, main.restSeconds]).toEqual([3, 6, 180]);
  });
  it('repeats workouts on the 6-day split and maps them to weekdays', () => {
    const sk = planSkeleton({ ...base, daysPerWeek: 6 });
    expect(sk.days.map((d) => d.key)).toEqual(['PU', 'PL', 'LG']);
    expect(sk.week.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('parsePlanDraft', () => {
  it('accepts a full draft and keeps skipped slots empty', () => {
    const raw = stubPlanDraft(base) as { workouts: { exercises: { slot: string; exercise?: string; skip?: boolean }[] }[] };
    raw.workouts[0]!.exercises[1] = { slot: raw.workouts[0]!.exercises[1]!.slot, skip: true };
    const r = parsePlanDraft(raw, base);
    expect(r.ok).toBe(true);
    if (r.ok && !('decline' in r.value)) expect(Object.values(r.value.days[0]!.fills).filter((v) => v === null)).toHaveLength(1);
  });
  it('rejects missing workouts and too many skips', () => {
    const raw = stubPlanDraft(base) as { workouts: { exercises: unknown[] }[] };
    expect(parsePlanDraft({ ...raw, workouts: raw.workouts.slice(1) }, base).ok).toBe(false);
    raw.workouts[0]!.exercises = [];
    expect(parsePlanDraft(raw, base).ok).toBe(false);
  });
  it('re-reads its own parsed output (the gateway shape)', () => {
    const first = parsePlanDraft(stubPlanDraft(base), base);
    expect(first.ok).toBe(true);
    if (first.ok) expect(parsePlanDraft(JSON.parse(JSON.stringify(first.value)), base)).toEqual(first);
  });
  it('passes declines through', () => {
    expect(parsePlanDraft({ decline: 'See a physio first.' }, base)).toEqual({ ok: true, value: { decline: 'See a physio first.' } });
  });
  it('drops extras that repeat a slot exercise and caps them at two', () => {
    const raw = stubPlanDraft(base) as { workouts: Record<string, unknown>[] };
    raw.workouts[0]!.extra = [
      { exercise: 'Barbell Bench Press', sets: 3, repsMin: 10 },
      { exercise: 'Hammer Curl', sets: 2, repsMin: 12, repsMax: 10 },
      { exercise: 'Preacher Curl', sets: 2, repsMin: 10 },
      { exercise: 'Wrist Curl', sets: 2, repsMin: 10 },
    ];
    const r = parsePlanDraft(raw, base);
    if (!r.ok || 'decline' in r.value) throw new Error('no parse');
    expect(r.value.days[0]!.extras).toEqual([
      { exercise: 'Hammer Curl', sets: 2, repsMin: 10, repsMax: 12 },
      { exercise: 'Preacher Curl', sets: 2, repsMin: 10, repsMax: 10 },
    ]);
  });
});

describe('balanceVolume', () => {
  it('brings every major muscle into the weekly band for common setups', () => {
    for (const days of [2, 3, 4, 5, 6]) {
      for (const experience of ['beginner', 'intermediate', 'advanced'] as const) {
        if (experience === 'beginner' && days > 4) continue;
        const input = { ...base, daysPerWeek: days, experience };
        const plan = stubPlan(input);
        const res = balanceVolume(plan, experience);
        expect(res.warnings, `${days} days, ${experience}`).toEqual([]);
        for (const d of res.days) for (const r of d.rows) expect(r.sets).toBeLessThanOrEqual(5);
      }
    }
  });
  it('trims accessories when a muscle is over the cap', () => {
    const plan = stubPlan({ ...base, daysPerWeek: 4, experience: 'beginner', minutes: 120 });
    // Pile extra shoulder work on so the cap has to bite.
    const heavy = { ...plan, days: plan.days.map((d) => ({ ...d, rows: d.rows.map((r) => (r.muscles?.primary === 'shoulders' ? { ...r, sets: 5 } : r)) })) };
    const res = balanceVolume(heavy, 'beginner');
    expect(res.weekly.shoulders).toBeLessThanOrEqual(14);
    for (const d of res.days) expect(d.rows.length).toBeGreaterThanOrEqual(4);
  });
});

describe('deload and description', () => {
  it('halves sets, keeps exercises', () => {
    const plan = stubPlan(base);
    const d = deloadDay(plan.days[0]!);
    expect(d.name).toBe(`${plan.days[0]!.name} (Deload)`);
    expect(d.rows.map((r) => r.exercise)).toEqual(plan.days[0]!.rows.map((r) => r.exercise));
    expect(d.rows[0]!.sets).toBe(Math.ceil(plan.days[0]!.rows[0]!.sets / 2));
  });
  it('spells out the weekly effort', () => {
    const plan = stubPlan(base);
    const text = planDescription(base, plan.skeleton, 'Four weeks to build muscle.');
    expect(text).toContain('Wk 1: stop ~3 reps short');
    expect(text).toContain('Wk 4: deload');
  });
});

describe('input and prompt', () => {
  it('clamps and defaults input', () => {
    const r = parsePlanBuildInput({ intent: ' Winter Arc ', weeks: 40, daysPerWeek: 9, minutes: 5, goal: 'x', equipment: ['dumbbell', 'laser'] });
    expect(r).toEqual({
      ok: true,
      value: { intent: 'Winter Arc', weeks: 16, daysPerWeek: 6, minutes: 20, goal: 'hypertrophy', experience: 'intermediate', equipment: ['dumbbell'] },
    });
    expect(parsePlanBuildInput({ weeks: 4 }).ok).toBe(false);
    const beginner = parsePlanBuildInput({ weeks: 4, daysPerWeek: 6, minutes: 45, experience: 'beginner' });
    expect(beginner.ok && beginner.value.daysPerWeek).toBe(4);
  });
  it('lists every slot id in the user message', () => {
    const msg = buildUserMessage({ ...base, equipment: ['dumbbell'] });
    for (const d of planSkeleton(base).days) for (const s of d.slots) expect(msg).toContain(`${s.id}:`);
    expect(msg).toContain('Equipment: dumbbell');
  });
});
