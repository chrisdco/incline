import { describe, expect, it } from 'vitest';
import { suggestNextLoad } from '../overload';
import {
  buildDeloadReason,
  detectPlateau,
  explainSuggestion,
  PLATEAU_SESSIONS,
  sessionsWithoutImprovement,
  type TopSetSample,
} from '../reason';
import { rewriteReason, setReasonRewriter } from '../rewrite-reason';
import { extractNumberTokens } from '../narrate-validate';
import type { LastWorkingSet, OverloadInput, ReadinessLevel } from '../types';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 29, 12).getTime(); // Thursday

function run(sets: LastWorkingSet[], opts: { readiness?: ReadinessLevel; history?: TopSetSample[] } = {}) {
  const input: OverloadInput = {
    exerciseId: 1,
    exerciseName: 'Bench',
    lastWorkingSets: sets,
    targetRepsMin: 6,
    targetRepsMax: 8,
    targetSets: 3,
    unit: 'metric',
    readiness: opts.readiness,
  };
  const before = suggestNextLoad(input)!;
  const s = { ...before };
  s.reason = explainSuggestion(s, {
    lastSets: sets,
    history: opts.history ?? [{ startedAt: NOW - 2 * DAY, weight: sets[0]?.weight ?? 0, reps: sets[0]?.reps ?? 0 }],
    targetRepsMin: 6,
    targetRepsMax: 8,
    unit: 'metric',
    unitSource: 'global',
    readiness: opts.readiness,
    now: NOW,
  });
  return { before, s, reason: s.reason };
}

const set = (weight: number, reps: number, rpe?: number): LastWorkingSet => ({ weight, reps, rpe });

describe('explainSuggestion', () => {
  it('does not change the numbers', () => {
    const { before, s } = run([set(80, 8), set(80, 8), set(80, 8)]);
    expect(s.weight).toBe(before.weight);
    expect(s.reps).toBe(before.reps);
    expect(s.reasonCode).toBe(before.reasonCode);
  });

  it('progress: sentence names last sets, the increment and the output', () => {
    const { s, reason } = run([set(80, 8), set(80, 8), set(80, 8)]);
    expect(reason.rule).toBe('progress');
    expect(reason.output).toMatchObject({ kind: 'load', weight: s.weight, reps: s.reps });
    expect(reason.sentence).toBe('You did 3×8 at 80 kg on Tuesday, reaching the top of your 6–8 range, so add 2.5 kg: 82.5 kg × 6.');
    expect(reason.inputs?.setsAtTarget).toBe(3);
    expect(reason.inputs?.daysSinceLast).toBe(2);
    expect(reason.inputs?.increment).toBe(2.5);
  });

  it('add-reps keeps weight', () => {
    const { s, reason } = run([set(80, 6), set(80, 6), set(80, 6)]);
    expect(reason.rule).toBe('add-reps');
    expect(s.weight).toBe(80);
    expect(reason.sentence).toContain('80 kg × 7');
  });

  it('repeat when a set missed the bottom', () => {
    const { reason } = run([set(80, 7), set(80, 5)]);
    expect(reason.rule).toBe('repeat');
    expect(reason.sentence).toContain('80 kg × 6');
  });

  it('match-top-set for mixed loads', () => {
    const { reason } = run([set(70, 8), set(80, 6)]);
    expect(reason.rule).toBe('match-top-set');
  });

  it('rpe-hold cites the RPE', () => {
    const { s, reason } = run([set(80, 8), set(80, 8), set(80, 8, 10)]);
    expect(reason.rule).toBe('rpe-hold');
    expect(s.weight).toBe(80);
    expect(reason.sentence).toContain('RPE 10');
  });

  it('readiness goes lighter', () => {
    const { s, reason } = run([set(80, 8), set(80, 8)], { readiness: 'tired' });
    expect(reason.rule).toBe('readiness');
    expect(reason.sentence).toContain(`77.5 kg × ${s.reps}`);
  });

  it('first-time', () => {
    const { reason } = run([], { history: [] });
    expect(reason.rule).toBe('first-time');
    expect(reason.inputs?.daysSinceLast).toBeNull();
  });

  it('every number in the sentence comes from inputs or output', () => {
    for (const sets of [[set(80, 8), set(80, 8)], [set(60, 6), set(60, 7)], [set(70, 8), set(80, 6)]]) {
      const { reason } = run(sets);
      const i = reason.inputs!;
      const allowed = new Set(
        extractNumberTokens(
          [
            ...i.lastSets.flatMap((x) => [x.weight, x.reps, x.rpe ?? '']),
            i.lastSets.length, i.targetRepsMin, i.targetRepsMax, i.increment,
            reason.output.kind === 'load' ? `${reason.output.weight} ${reason.output.reps}` : '',
          ].join(' '),
        ),
      );
      for (const n of extractNumberTokens(reason.sentence)) expect(allowed.has(n)).toBe(true);
    }
  });

  it('return-after-break signal past the threshold', () => {
    const { reason } = run([set(80, 6)], { history: [{ startedAt: NOW - 30 * DAY, weight: 80, reps: 6 }] });
    expect(reason.signals.map((x) => x.rule)).toContain('return-after-break');
  });
});

describe('plateau', () => {
  const flat = (n: number): TopSetSample[] =>
    Array.from({ length: n }, (_, k) => ({ startedAt: NOW - (k + 1) * 3 * DAY, weight: 80, reps: 6 }));

  it(`flags after ${PLATEAU_SESSIONS} flat sessions`, () => {
    expect(detectPlateau(flat(PLATEAU_SESSIONS + 1))).toEqual({ sessions: PLATEAU_SESSIONS });
  });

  it('needs enough history', () => {
    expect(detectPlateau(flat(PLATEAU_SESSIONS))).toBeNull();
  });

  it('a recent improvement clears it', () => {
    const h = flat(PLATEAU_SESSIONS + 1);
    h[0] = { ...h[0], reps: 8 };
    expect(sessionsWithoutImprovement(h)).toBe(0);
    expect(detectPlateau(h)).toBeNull();
  });

  it('surfaces as a signal on non-progress suggestions', () => {
    const { reason } = run([set(80, 6), set(80, 5)], { history: flat(PLATEAU_SESSIONS + 1) });
    expect(reason.signals.map((x) => x.rule)).toContain('plateau');
  });
});

describe('deload reason', () => {
  it('wraps detectDeload output', () => {
    const r = buildDeloadReason({ weeksTrained: 5, volumeScale: 0.6, reasonText: '' }, '1.3.0');
    expect(r.rule).toBe('deload');
    expect(r.sentence).toBe("You've trained 5 weeks in a row, so cut sets to about 60% for one week.");
  });
});

describe('rewriteReason', () => {
  const { reason } = run([set(80, 8), set(80, 8), set(80, 8)]);

  it('defaults to the deterministic sentence', async () => {
    setReasonRewriter(null);
    expect(await rewriteReason(reason)).toBe(reason.sentence);
  });

  it('accepts a rephrase with the same numbers', async () => {
    setReasonRewriter(async () => 'Nice: 3×8 at 80 kg on Tuesday in your 6–8 range. Add 2.5 kg for 82.5 kg × 6.');
    expect(await rewriteReason(reason)).toMatch(/^Nice/);
  });

  it('rejects a rewrite that changes a number', async () => {
    setReasonRewriter(async () => 'Go 85 kg × 6.');
    expect(await rewriteReason(reason)).toBe(reason.sentence);
    setReasonRewriter(null);
  });
});
