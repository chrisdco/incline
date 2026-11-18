import { describe, expect, it } from 'vitest';

import {
  assessProposal,
  autoApplies,
  findPlateaus,
  isLowRisk,
  parseRemedyPlan,
  PROGRESSION_RULE_VERSION,
  type LiftHistory,
  type LiftSession,
  type ProgressionContext,
  type ProgressionDecision,
} from '@/contracts/coaching/progression';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-17T12:00:00Z');

/** n sessions newest first, every 3 days, same top set. */
function flat(n: number, weightKg = 100, reps = 5, extra: Partial<LiftSession> = {}): LiftSession[] {
  return Array.from({ length: n }, (_, i) => ({ at: NOW - (i + 1) * 3 * DAY, weightKg, reps, sets: 3, ...extra }));
}

function lift(key: string, sessions: LiftSession[], muscle = 'chest', name = key): LiftHistory {
  return { key, name, muscle, sessions };
}

function ctx(over: Partial<ProgressionContext> = {}): ProgressionContext {
  return {
    now: NOW,
    unit: 'metric',
    experience: 'intermediate',
    weeklyMuscleSets: { chest: 12, back: 12, quads: 12 },
    trainingStreakWeeks: 2,
    ...over,
  };
}

function decision(over: Partial<ProgressionDecision>): ProgressionDecision {
  return {
    id: 'd1',
    exerciseKey: 'catalog:bench',
    remedy: 'reset',
    params: null,
    status: 'applied',
    source: 'coach',
    rationale: '',
    ruleVersion: PROGRESSION_RULE_VERSION,
    resumeAfterSessions: null,
    createdAt: NOW - 10 * DAY,
    resolvedAt: null,
    ...over,
  };
}

describe('findPlateaus: detection', () => {
  it('flags 4 flat sessions after a baseline, not fewer', () => {
    expect(findPlateaus([lift('catalog:bench', flat(5))], ctx())).toHaveLength(1);
    expect(findPlateaus([lift('catalog:bench', flat(4))], ctx())).toHaveLength(0);
  });

  it('ignores a lift that is still progressing', () => {
    const rising = Array.from({ length: 6 }, (_, i) => ({ at: NOW - (i + 1) * 3 * DAY, weightKg: 100 - i * 2.5, reps: 5, sets: 3 }));
    expect(findPlateaus([lift('catalog:bench', rising)], ctx())).toHaveLength(0);
  });

  it('ignores lifts not trained in 6 weeks', () => {
    const old = flat(5).map((s) => ({ ...s, at: s.at - 60 * DAY }));
    expect(findPlateaus([lift('catalog:bench', old)], ctx())).toHaveLength(0);
  });
});

describe('findPlateaus: cause and fix', () => {
  it('default: reset about 10%, rounded to plates', () => {
    const [f] = findPlateaus([lift('catalog:bench', flat(5, 102.5))], ctx());
    expect(f!.cause).toBe('stuck');
    expect(f!.fix.plan).toEqual({ remedy: 'reset', weightKg: 92.5, fromKg: 102.5 });
    expect(f!.fix.lowRisk).toBe(true);
    expect(f!.alternatives.map((a) => a.plan.remedy)).toEqual(['rep_range', 'add_set', 'swap']);
  });

  it('imperial resets land on 5 lb steps', () => {
    const [f] = findPlateaus([lift('catalog:bench', flat(5, 225 * 0.45359237))], ctx({ unit: 'imperial' }));
    expect(f!.fix.sentence).toContain('205 lb');
  });

  it('hard top sets read as lift fatigue', () => {
    const [f] = findPlateaus([lift('catalog:bench', flat(5, 100, 5, { rpe: 9.5 }))], ctx());
    expect(f!.cause).toBe('fatigue_lift');
    expect(f!.fix.plan.remedy).toBe('reset');
  });

  it('three stalled lifts after 4+ weeks read as program fatigue: deload', () => {
    const lifts = ['bench', 'squat', 'row'].map((k) => lift(`catalog:${k}`, flat(5)));
    const out = findPlateaus(lifts, ctx({ trainingStreakWeeks: 5 }));
    expect(out.every((f) => f.cause === 'fatigue_program' && f.fix.plan.remedy === 'deload')).toBe(true);
    expect(out[0]!.fix.lowRisk).toBe(false);
  });

  it('no deload inside the cooldown', () => {
    const lifts = ['bench', 'squat', 'row'].map((k) => lift(`catalog:${k}`, flat(5)));
    const out = findPlateaus(lifts, ctx({ trainingStreakWeeks: 5, lastDeloadAt: NOW - 5 * DAY }));
    expect(out.some((f) => f.fix.plan.remedy === 'deload')).toBe(false);
  });

  it('a muscle under the weekly floor gets a set', () => {
    const [f] = findPlateaus([lift('catalog:bench', flat(5))], ctx({ weeklyMuscleSets: { chest: 3 } }));
    expect(f!.cause).toBe('low_volume');
    expect(f!.fix.plan).toEqual({ remedy: 'add_set', sets: 4, fromSets: 3 });
  });

  it('a long stall suggests a variation', () => {
    const [f] = findPlateaus([lift('catalog:bench', flat(9))], ctx());
    expect(f!.sessions).toBe(8);
    expect(f!.cause).toBe('long_stall');
    expect(f!.fix.plan.remedy).toBe('swap');
  });

  it('rep range shifts from the routine range when known', () => {
    const l = { ...lift('catalog:bench', flat(5)), repRange: { min: 8, max: 12 } };
    const [f] = findPlateaus([l], ctx());
    const rr = [f!.fix, ...f!.alternatives].find((o) => o.plan.remedy === 'rep_range')!;
    expect(rr.plan).toMatchObject({ min: 5, max: 8, fromMin: 8, fromMax: 12 });
  });
});

describe('findPlateaus: decisions', () => {
  it('a proposed fix is reported, not re-suggested', () => {
    const [f] = findPlateaus([lift('catalog:bench', flat(5))], ctx({ decisions: [decision({ status: 'proposed', createdAt: NOW - DAY })] }));
    expect(f!.status).toBe('proposed');
    expect(f!.decision?.id).toBe('d1');
  });

  it('an applied fix not trained since is reported as applied', () => {
    const [f] = findPlateaus([lift('catalog:bench', flat(5))], ctx({ decisions: [decision({ createdAt: NOW - DAY })] }));
    expect(f!.status).toBe('applied');
  });

  it('after an applied reset only post-fix sessions count', () => {
    // Fix 10 days ago; three sessions since (lighter, as a reset should be).
    const s = [
      ...flat(3, 90).map((x, i) => ({ ...x, at: NOW - (i + 1) * 2 * DAY })),
      ...flat(5, 100).map((x) => ({ ...x, at: x.at - 12 * DAY })),
    ];
    expect(findPlateaus([lift('catalog:bench', s)], ctx({ decisions: [decision({})] }))).toHaveLength(0);
  });

  it('declined stays quiet for 3 more sessions, then comes back', () => {
    const declined = decision({ status: 'declined', createdAt: NOW - 7 * DAY, remedy: 'reset' });
    // flat(5): sessions at 3,6,9,12,15 days ago → 2 since the decision.
    expect(findPlateaus([lift('catalog:bench', flat(5))], ctx({ decisions: [declined] }))).toHaveLength(0);
    expect(findPlateaus([lift('catalog:bench', flat(6))], ctx({ decisions: [{ ...declined, createdAt: NOW - 10 * DAY }] }))).toHaveLength(1);
  });

  it('reverted decisions are ignored', () => {
    const out = findPlateaus([lift('catalog:bench', flat(5))], ctx({ decisions: [decision({ status: 'reverted', createdAt: NOW - DAY })] }));
    expect(out[0]!.status).toBe('open');
  });
});

describe('assessProposal: when an AI disagrees', () => {
  const [finding] = findPlateaus([lift('catalog:bench', flat(5))], ctx());
  const current = { topKg: 100, sets: 3 };

  it('same fix: matches', () => {
    expect(assessProposal({ remedy: 'reset', weightKg: 90, fromKg: 100 }, finding!, current, 'metric').verdict).toBe('matches');
  });

  it('a different, safe fix: differs, with the house fix alongside', () => {
    const a = assessProposal({ remedy: 'swap', substituteKey: 'catalog:paused-bench', substituteName: 'Paused bench' }, finding!, current, 'metric');
    expect(a.verdict).toBe('differs');
    expect(a.house?.plan.remedy).toBe('swap');
  });

  it('outside the bounds: unsafe, with the reason', () => {
    const a = assessProposal({ remedy: 'reset', weightKg: 60, fromKg: 100 }, finding!, current, 'metric');
    expect(a.verdict).toBe('unsafe');
    expect(a.verdict === 'unsafe' && a.problems[0]).toContain('40%');
    expect(assessProposal({ remedy: 'add_set', sets: 12, fromSets: 3 }, finding!, current, 'metric').verdict).toBe('unsafe');
    expect(assessProposal({ remedy: 'rep_range', min: 12, max: 8, fromMin: 8, fromMax: 12 }, finding!, current, 'metric').verdict).toBe('unsafe');
  });

  it('works with no house finding (lift not stalled by our rule)', () => {
    expect(assessProposal({ remedy: 'rep_range', min: 6, max: 8, fromMin: 8, fromMax: 12 }, null, current, 'metric').verdict).toBe('differs');
  });
});

describe('autonomy and parsing', () => {
  it('only house low-risk fixes auto-apply, only in auto mode', () => {
    const [f] = findPlateaus([lift('catalog:bench', flat(5))], ctx());
    expect(autoApplies('auto_safe', f!.fix, 'coach')).toBe(true);
    expect(autoApplies('ask', f!.fix, 'coach')).toBe(false);
    expect(autoApplies('auto_safe', f!.fix, 'mcp:claude')).toBe(false);
    expect(isLowRisk({ remedy: 'reset', weightKg: 80, fromKg: 100 })).toBe(false);
    expect(isLowRisk({ remedy: 'add_set', sets: 5, fromSets: 3 })).toBe(false);
  });

  it('parses untrusted plans strictly', () => {
    expect(parseRemedyPlan({ remedy: 'reset', weightKg: 90, fromKg: 100 })).toEqual({ remedy: 'reset', weightKg: 90, fromKg: 100 });
    expect(parseRemedyPlan({ remedy: 'reset', weightKg: '90' })).toBeNull();
    expect(parseRemedyPlan({ remedy: 'drop_table' })).toBeNull();
    expect(parseRemedyPlan(null)).toBeNull();
  });
});
