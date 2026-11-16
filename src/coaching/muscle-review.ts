import type { MuscleDistribution, MuscleGroup, ProgressRange } from '@/db/types';
import { MUSCLE_LABELS } from '@/lib/labels';

/**
 * The muscle distribution review: one read across several angles instead of
 * a single "X is lower than Y" line. Deterministic and explainable (every
 * point names its numbers), so Ask can later expand on it from the same
 * structured output rather than guess.
 *
 * Guidance used (common hypertrophy recommendations, not a prescription):
 * roughly 10–20 working sets per muscle per week for growth, a few sets a
 * week to maintain; push and pull kept near 1:1; legs a real share of work.
 */

export const REVIEW_RULE_VERSION = 'muscle-review-1';

const MIN_GROWTH_SETS_WK = 10;
const MAX_USEFUL_SETS_WK = 20;
const MAINTAIN_SETS_WK = 4;
const PUSH_PULL_SKEW = 1.5;
const LOWER_SHARE_MIN = 0.25;
const CHANGE_MIN_SETS = 4;
const RECOVERY_GAP_DAYS = 8;

/** Muscles the review talks about; core, forearms, traps and full-body are left out of ratio maths. */
const MAJOR: readonly MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves'];
const PUSH: readonly MuscleGroup[] = ['chest', 'shoulders', 'triceps'];
const PULL: readonly MuscleGroup[] = ['back', 'biceps'];
const LOWER: readonly MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'calves'];

const WEEKS: Record<Exclude<ProgressRange, 'all'>, number> = { '1w': 1, '30d': 30 / 7, '3m': 13, '1y': 52 };

export type ReviewTone = 'good' | 'watch' | 'act';

export interface ReviewPoint {
  id: 'volume_low' | 'volume_high' | 'volume_ok' | 'push_pull' | 'upper_lower' | 'change' | 'untrained' | 'recovery_gap';
  tone: ReviewTone;
  title: string;
  body: string;
}

export interface MuscleReview {
  /** One sentence over the whole picture. */
  summary: string;
  points: ReviewPoint[];
  ruleVersion: string;
}

const label = (m: string) => MUSCLE_LABELS[m as MuscleGroup] ?? m;
const list = (ms: readonly string[]) => {
  const names = ms.map(label);
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

export function reviewMuscles(input: {
  range: ProgressRange;
  current: readonly MuscleDistribution[];
  previous: readonly MuscleDistribution[];
  /** Days since each muscle was last trained (all time). */
  exposureDays?: Record<string, number> | null;
}): MuscleReview | null {
  const sets = new Map(input.current.map((m) => [m.muscle, m.sets]));
  const total = MAJOR.reduce((a, m) => a + (sets.get(m) ?? 0), 0);
  if (total === 0) return null;
  const points: ReviewPoint[] = [];
  const of = (ms: readonly MuscleGroup[]) => ms.reduce((a, m) => a + (sets.get(m) ?? 0), 0);

  // 1. Weekly sets per muscle against the usual growth range (needs a known span).
  if (input.range !== 'all') {
    const weeks = WEEKS[input.range];
    const perWeek = MAJOR.map((m) => ({ m, wk: (sets.get(m) ?? 0) / weeks }));
    const low = perWeek.filter((x) => x.wk > 0 && x.wk < MIN_GROWTH_SETS_WK).sort((a, b) => a.wk - b.wk);
    const high = perWeek.filter((x) => x.wk > MAX_USEFUL_SETS_WK);
    const inRange = perWeek.filter((x) => x.wk >= MIN_GROWTH_SETS_WK && x.wk <= MAX_USEFUL_SETS_WK);
    if (low.length) {
      const maintenance = low.filter((x) => x.wk < MAINTAIN_SETS_WK);
      points.push({
        id: 'volume_low',
        tone: maintenance.length ? 'act' : 'watch',
        title: 'Below the usual growth range',
        body:
          `${low.slice(0, 4).map((x) => `${label(x.m)} ${round1(x.wk)}`).join(', ')} sets a week. ` +
          `Most growth guidance starts around ${MIN_GROWTH_SETS_WK}` +
          (maintenance.length ? `; under ${MAINTAIN_SETS_WK} is closer to maintenance.` : '.'),
      });
    }
    if (high.length) {
      points.push({
        id: 'volume_high',
        tone: 'watch',
        title: 'Very high weekly volume',
        body: `${list(high.map((x) => x.m))} at over ${MAX_USEFUL_SETS_WK} sets a week. Past that, extra sets tend to add fatigue more than growth.`,
      });
    }
    if (inRange.length) {
      points.push({
        id: 'volume_ok',
        tone: 'good',
        title: 'In the growth range',
        body: `${list(inRange.map((x) => x.m))} sit at ${MIN_GROWTH_SETS_WK}–${MAX_USEFUL_SETS_WK} sets a week.`,
      });
    }
  }

  // 2. Push vs pull.
  const push = of(PUSH);
  const pull = of(PULL);
  if (push + pull >= 6) {
    const ratio = pull === 0 ? Infinity : push / pull;
    if (ratio >= PUSH_PULL_SKEW || ratio <= 1 / PUSH_PULL_SKEW) {
      const pushHeavy = ratio >= PUSH_PULL_SKEW;
      points.push({
        id: 'push_pull',
        tone: 'watch',
        title: pushHeavy ? 'More pushing than pulling' : 'More pulling than pushing',
        body:
          `${push} push sets to ${pull} pull. ` +
          (pushHeavy ? 'Adding rows or pulldowns keeps shoulders balanced.' : 'Some pressing evens it out.'),
      });
    } else {
      points.push({ id: 'push_pull', tone: 'good', title: 'Push and pull balanced', body: `${push} push sets to ${pull} pull.` });
    }
  }

  // 3. Upper vs lower.
  const lower = of(LOWER);
  const share = lower / total;
  if (share < LOWER_SHARE_MIN) {
    points.push({
      id: 'upper_lower',
      tone: lower === 0 ? 'act' : 'watch',
      title: 'Legs are a small share',
      body: `${Math.round(share * 100)}% of your sets were legs (${lower} of ${total}). A quarter or more is typical for balanced training.`,
    });
  }

  // 4. Biggest shift vs the previous equal window.
  if (input.range !== 'all' && input.previous.length) {
    const prev = new Map(input.previous.map((m) => [m.muscle, m.sets]));
    const moves = MAJOR.map((m) => ({ m, d: (sets.get(m) ?? 0) - (prev.get(m) ?? 0) })).filter((x) => Math.abs(x.d) >= CHANGE_MIN_SETS);
    if (moves.length) {
      const up = moves.filter((x) => x.d > 0).sort((a, b) => b.d - a.d)[0];
      const down = moves.filter((x) => x.d < 0).sort((a, b) => a.d - b.d)[0];
      const parts = [up && `${label(up.m)} up ${up.d} sets`, down && `${label(down.m)} down ${-down.d}`].filter(Boolean);
      points.push({ id: 'change', tone: 'watch', title: 'Shift since the last period', body: `${parts.join(', ')} vs the window before.` });
    }
  }

  // 5. Untrained in this window, and long gaps overall.
  const untrained = MAJOR.filter((m) => !sets.get(m));
  if (untrained.length && untrained.length < MAJOR.length) {
    points.push({ id: 'untrained', tone: 'act', title: 'Not trained this period', body: `${list(untrained)}.` });
  }
  const gaps = Object.entries(input.exposureDays ?? {})
    .filter(([m, d]) => d >= RECOVERY_GAP_DAYS && (MAJOR as readonly string[]).includes(m) && !untrained.includes(m as MuscleGroup))
    .sort((a, b) => b[1] - a[1]);
  if (gaps.length) {
    points.push({
      id: 'recovery_gap',
      tone: 'watch',
      title: 'Long gaps',
      body: gaps.slice(0, 3).map(([m, d]) => `${label(m)} ${d} days`).join(', ') + ' since last trained.',
    });
  }

  const issues = points.filter((p) => p.tone !== 'good').length;
  const summary =
    issues === 0
      ? 'Balanced: volume, push/pull and legs all look on track.'
      : `${issues} thing${issues === 1 ? '' : 's'} to look at, most important first.`;
  const order: Record<ReviewTone, number> = { act: 0, watch: 1, good: 2 };
  return { summary, points: points.sort((a, b) => order[a.tone] - order[b.tone]), ruleVersion: REVIEW_RULE_VERSION };
}
