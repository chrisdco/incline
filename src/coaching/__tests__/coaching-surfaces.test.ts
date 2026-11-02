import { describe, expect, it } from 'vitest';
import { deloadInsight, deloadSentence, detectDeload } from '../deload';
import {
  buildDeloadReason,
  deloadReasonDetail,
  plateauSignal,
  PLATEAU_SESSIONS,
  type TopSetSample,
} from '../reason';
import { collectStalledLifts, STALLED_MAX, STALLED_RECENT_DAYS } from '../stalled';
import { extractNumberTokens } from '../narrate-validate';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 29, 12).getTime();

const flat = (n: number, lastDaysAgo = 2, weight = 80): TopSetSample[] =>
  Array.from({ length: n }, (_, k) => ({ startedAt: NOW - (lastDaysAgo + k * 3) * DAY, weight, reps: 6 }));

const rising = (n: number): TopSetSample[] =>
  Array.from({ length: n }, (_, k) => ({ startedAt: NOW - (2 + k * 3) * DAY, weight: 100 - k * 2.5, reps: 6 }));

describe('deload reason detail', () => {
  const d = { weeksTrained: 6, volumeScale: 0.6, reasonText: '' };

  it('home insight body matches the deload reason sentence', () => {
    expect(deloadInsight(d).body).toBe(buildDeloadReason(d, '1.3.0').sentence);
    expect(deloadSentence(d)).toBe("You've trained 6 weeks in a row, so cut sets to about 60% for one week.");
  });

  it('lists the inputs the rule saw', () => {
    const detail = deloadReasonDetail(d, '1.3.0');
    expect(detail.reason.rule).toBe('deload');
    expect(detail.inputs).toEqual([
      { label: 'Training weeks in a row', value: '6' },
      { label: 'Suggested from', value: '4 weeks' },
      { label: 'Working sets for one week', value: 'About 60%' },
    ]);
    expect(detail.rule).toContain('4 or more training weeks');
    expect(detail.rule).toContain('1.3.0');
  });

  it('every number in the sentence comes from the inputs', () => {
    const detail = deloadReasonDetail(d, '1.3.0');
    const inputNumbers = new Set(detail.inputs.flatMap((r) => extractNumberTokens(r.value)));
    for (const t of extractNumberTokens(detail.reason.sentence)) expect(inputNumbers).toContain(t);
  });

  it('wraps a real detectDeload result', () => {
    const s = detectDeload({ weeklyStreak: 5, weeklyVolumes: [], now: NOW })!;
    expect(deloadReasonDetail(s, '1.3.0').inputs[0].value).toBe('5');
  });
});

describe('plateauSignal', () => {
  it('fires on a flat history', () => {
    expect(plateauSignal(flat(PLATEAU_SESSIONS + 1))?.rule).toBe('plateau');
  });

  it('stays quiet while lifts improve or history is short', () => {
    expect(plateauSignal(rising(PLATEAU_SESSIONS + 1))).toBeNull();
    expect(plateauSignal(flat(PLATEAU_SESSIONS))).toBeNull();
    expect(plateauSignal([])).toBeNull();
  });
});

describe('collectStalledLifts', () => {
  const n = PLATEAU_SESSIONS + 1;

  it('lists only plateaued, recently trained lifts', () => {
    const out = collectStalledLifts(
      { 1: flat(n), 2: rising(n), 3: flat(n, STALLED_RECENT_DAYS + 1), 4: flat(n - 1) },
      { 1: 'Bench', 2: 'Squat', 3: 'Old lift', 4: 'New lift' },
      NOW,
    );
    expect(out.map((x) => x.exerciseId)).toEqual([1]);
    expect(out[0]).toMatchObject({ name: 'Bench', sessions: PLATEAU_SESSIONS });
    expect(out[0].sentence).toBe(plateauSignal(flat(n))!.sentence);
  });

  it('orders by most recent and caps the list', () => {
    const histories: Record<number, TopSetSample[]> = {};
    for (let id = 1; id <= STALLED_MAX + 2; id++) histories[id] = flat(n, id);
    const out = collectStalledLifts(histories, {}, NOW);
    expect(out).toHaveLength(STALLED_MAX);
    expect(out[0].exerciseId).toBe(1);
    expect(out[0].name).toBe('Exercise');
  });
});
