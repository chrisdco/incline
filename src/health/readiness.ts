import type { ReadinessLevel } from '@/coaching/types';

import type { HealthKind, HealthPort, PointSample, SleepNight } from './types';

/**
 * The readiness rule (AI-ARCHITECTURE "How health data is used", HEALTH.md):
 * last night's sleep, HRV and resting HR against the user's own 4-week
 * baseline. Advisory only: it suggests a check-in level, the user still
 * picks. Its output (daily aggregates) is all Ask ever sees of health data.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Readings from the last night/morning count as "today". */
const TODAY_WINDOW = 20 * HOUR;
/** Sleep sessions ending this recently count as last night. */
const NIGHT_WINDOW = 18 * HOUR;
const BASELINE_DAYS = 28;
/** A baseline needs this many days with a reading before we compare to it. */
export const MIN_BASELINE_DAYS = 5;

export const SLEEP_SHORT_MIN = 6 * 60;
export const SLEEP_OK_MIN = 7 * 60;
const SLEEP_VERY_SHORT_MIN = 5 * 60;
/** HRV this far under baseline reads as strain (common guidance: ~10–20% drop). */
const HRV_LOW = -0.15;
const HRV_HIGH = 0.05;
/** Resting HR this many bpm over baseline reads as strain. */
const RHR_HIGH_BPM = 5;
const RHR_LOW_BPM = -2;

export interface Compared {
  today: number;
  baseline: number;
}

export interface ReadinessSignal {
  kind: 'sleep' | 'hrv' | 'restingHeartRate';
  tone: 'good' | 'mild' | 'strain';
  text: string;
}

/** Daily aggregates. Never raw samples; this is what Ask may read. */
export interface HealthSnapshot {
  granted: HealthKind[];
  lastNightSleepMinutes: number | null;
  avgSleepMinutes7d: number | null;
  hrv: Compared | null;
  restingHeartRate: Compared | null;
  stepsToday: number | null;
  latestWeightKg: number | null;
  suggestion: { level: ReadinessLevel; signals: ReadinessSignal[] } | null;
  /** Per granted kind: what actually arrived (Health screen, the "learning" line). */
  coverage: Partial<Record<HealthKind, KindCoverage>>;
}

export interface KindCoverage {
  /** Distinct days with a reading in the read window (sleep 8 d, weight 30 d, HRV/RHR 29 d, steps today). */
  days: number;
  lastAt: number | null;
  /** HRV / resting HR: days of history toward MIN_BASELINE_DAYS. */
  baselineDays?: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Days with a reading in the baseline window (before today's). */
export function baselineDayCount(samples: readonly PointSample[], now: number): number {
  const todayFrom = now - TODAY_WINDOW;
  const days = new Set<number>();
  for (const s of samples) if (s.at <= todayFrom && s.at >= todayFrom - BASELINE_DAYS * DAY) days.add(Math.floor(s.at / DAY));
  return days.size;
}

function pointCoverage(samples: readonly PointSample[]): KindCoverage {
  return { days: new Set(samples.map((s) => Math.floor(s.at / DAY))).size, lastAt: samples.length ? Math.max(...samples.map((s) => s.at)) : null };
}

/**
 * One plain line for Home when there's no full read: what's missing or still
 * being learned. Null when every granted kind is arriving and compared, or
 * nothing is granted.
 */
export function healthStatusLine(s: Pick<HealthSnapshot, 'granted' | 'coverage'>): string | null {
  const parts: string[] = [];
  const empty = (['sleep', 'hrv', 'restingHeartRate'] as const).filter((k) => s.granted.includes(k) && (s.coverage[k]?.days ?? 0) === 0);
  if (empty.length) {
    const names = empty.map((k) => (k === 'sleep' ? 'sleep' : k === 'hrv' ? 'HRV' : 'resting HR'));
    parts.push(`No ${names.join(' or ')} in Health Connect yet`);
  }
  const learning = (['hrv', 'restingHeartRate'] as const)
    .filter((k) => (s.coverage[k]?.days ?? 0) > 0)
    .map((k) => s.coverage[k]?.baselineDays ?? 0)
    .filter((d) => d < MIN_BASELINE_DAYS);
  if (learning.length) parts.push(`Learning your usual (${Math.min(...learning)}/${MIN_BASELINE_DAYS} days)`);
  return parts.length ? parts.join(' · ') : null;
}

/** Today's mean vs the median of earlier daily means; null without enough history. */
export function compareToBaseline(samples: readonly PointSample[], now: number): Compared | null {
  const todayFrom = now - TODAY_WINDOW;
  const today = samples.filter((s) => s.at > todayFrom && s.at <= now);
  if (!today.length) return null;
  const byDay = new Map<number, number[]>();
  for (const s of samples) {
    if (s.at > todayFrom || s.at < todayFrom - BASELINE_DAYS * DAY) continue;
    const d = Math.floor(s.at / DAY);
    byDay.set(d, [...(byDay.get(d) ?? []), s.value]);
  }
  if (byDay.size < MIN_BASELINE_DAYS) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { today: round1(mean(today.map((s) => s.value))), baseline: round1(median([...byDay.values()].map(mean))) };
}

export const formatSleep = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;

export function lastNightMinutes(nights: readonly SleepNight[], now: number): number | null {
  const recent = nights.filter((n) => n.end > now - NIGHT_WINDOW && n.end <= now);
  return recent.length ? recent.reduce((a, n) => a + n.minutes, 0) : null;
}

export function readinessFrom(input: { sleepMinutes: number | null; hrv: Compared | null; restingHeartRate: Compared | null }): HealthSnapshot['suggestion'] {
  const signals: ReadinessSignal[] = [];
  const { sleepMinutes: sleep, hrv, restingHeartRate: rhr } = input;
  if (sleep !== null) {
    const tone = sleep < SLEEP_SHORT_MIN ? 'strain' : sleep < SLEEP_OK_MIN ? 'mild' : 'good';
    signals.push({ kind: 'sleep', tone, text: `Slept ${formatSleep(sleep)}` });
  }
  if (hrv && hrv.baseline > 0) {
    const pct = hrv.today / hrv.baseline - 1;
    const tone = pct <= HRV_LOW ? 'strain' : pct >= HRV_HIGH ? 'good' : 'mild';
    const p = Math.round(Math.abs(pct) * 100);
    signals.push({ kind: 'hrv', tone, text: p < 3 ? 'HRV at your usual' : `HRV ${p}% ${pct < 0 ? 'under' : 'over'} your usual` });
  }
  if (rhr) {
    const diff = Math.round(rhr.today - rhr.baseline);
    const tone = diff >= RHR_HIGH_BPM ? 'strain' : diff <= RHR_LOW_BPM ? 'good' : 'mild';
    signals.push({ kind: 'restingHeartRate', tone, text: diff === 0 ? 'Resting HR at your usual' : `Resting HR ${Math.abs(diff)} bpm ${diff > 0 ? 'above' : 'below'} usual` });
  }
  if (!signals.length) return null;
  const strain = signals.filter((s) => s.tone === 'strain').length;
  const mild = signals.filter((s) => s.tone === 'mild').length;
  const level: ReadinessLevel =
    strain >= 2 || (sleep !== null && sleep < SLEEP_VERY_SHORT_MIN) ? 'tired' : strain === 1 || mild === signals.length ? 'ok' : 'fresh';
  return { level, signals };
}

/** Reads the port once and reduces it to daily aggregates. Missing permissions are empty, never errors. */
export async function readHealthSnapshot(port: HealthPort, now = Date.now()): Promise<HealthSnapshot> {
  const granted = await port.granted();
  const has = (k: HealthKind) => granted.includes(k);
  const range = { start: now - (BASELINE_DAYS + 1) * DAY, end: now };
  const safe = async <T,>(on: boolean, read: () => Promise<T>, empty: T): Promise<T> => {
    if (!on) return empty;
    try {
      return await read();
    } catch {
      return empty;
    }
  };
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const [nights, hrvs, rhrs, weights, steps] = await Promise.all([
    safe(has('sleep'), () => port.readSleep({ start: now - 8 * DAY, end: now }), [] as SleepNight[]),
    safe(has('hrv'), () => port.readPoints('hrv', range), [] as PointSample[]),
    safe(has('restingHeartRate'), () => port.readPoints('restingHeartRate', range), [] as PointSample[]),
    safe(has('weight'), () => port.readPoints('weight', { start: now - 30 * DAY, end: now }), [] as PointSample[]),
    safe(has('steps'), () => port.readSteps({ start: midnight.getTime(), end: now }), null as number | null),
  ]);
  const lastNight = lastNightMinutes(nights, now);
  const week = nights.filter((n) => n.end > now - 7 * DAY);
  const hrv = compareToBaseline(hrvs, now);
  const restingHeartRate = compareToBaseline(rhrs, now);
  const coverage: Partial<Record<HealthKind, KindCoverage>> = {};
  if (has('sleep')) coverage.sleep = { days: new Set(nights.map((n) => Math.floor(n.end / DAY))).size, lastAt: nights.length ? Math.max(...nights.map((n) => n.end)) : null };
  if (has('hrv')) coverage.hrv = { ...pointCoverage(hrvs), baselineDays: baselineDayCount(hrvs, now) };
  if (has('restingHeartRate')) coverage.restingHeartRate = { ...pointCoverage(rhrs), baselineDays: baselineDayCount(rhrs, now) };
  if (has('weight')) coverage.weight = pointCoverage(weights);
  if (has('steps')) coverage.steps = { days: steps ? 1 : 0, lastAt: null };
  return {
    granted,
    coverage,
    lastNightSleepMinutes: lastNight,
    avgSleepMinutes7d: week.length ? Math.round(week.reduce((a, n) => a + n.minutes, 0) / week.length) : null,
    hrv,
    restingHeartRate,
    stepsToday: has('steps') ? steps : null,
    latestWeightKg: weights.length ? round1(weights.at(-1)!.value) : null,
    suggestion: readinessFrom({ sleepMinutes: lastNight, hrv, restingHeartRate }),
  };
}
