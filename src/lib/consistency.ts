import { isoDate, startOfDay, startOfWeek } from '@/db/calc';

const WEEK_MS = 7 * 86_400_000;

/**
 * Local calendar-day key (`YYYY-MM-DD` in the device time zone) for an epoch
 * ms. Every per-day bucket (calendar, day counts, recaps) uses this, never
 * `ms / 86_400_000`, which groups by UTC day (#150).
 */
export function localDayKey(ms: number): string {
  return isoDate(ms);
}

/** Distinct local calendar days among `startedAts`. */
export function countLocalDays(startedAts: Iterable<number>): number {
  const days = new Set<string>();
  for (const t of startedAts) days.add(localDayKey(t));
  return days.size;
}

function toDaySet(dayKeys: Iterable<string>): Set<string> {
  return dayKeys instanceof Set ? dayKeys : new Set(dayKeys);
}

function parseLocalDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function shiftDays(ms: number, days: number): number {
  const d = new Date(startOfDay(ms));
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/**
 * Consecutive weeks (ending this week, or last week if this week is empty)
 * that contain at least one session. Monday-based, matching `getStreak()`.
 */
export function computeWeeklyStreak(startedAts: number[], now = Date.now()): number {
  if (startedAts.length === 0) return 0;
  const weeks = new Set(startedAts.map((t) => isoDate(startOfWeek(t))));
  const thisWeek = isoDate(startOfWeek(now));
  const lastWeek = isoDate(startOfWeek(now) - WEEK_MS);
  if (!weeks.has(thisWeek) && !weeks.has(lastWeek)) return 0;
  let cursor = weeks.has(thisWeek) ? now : now - WEEK_MS;
  let streak = 0;
  while (weeks.has(isoDate(startOfWeek(cursor)))) {
    streak++;
    cursor -= WEEK_MS;
  }
  return streak;
}

/** Longest run of consecutive Monday-based weeks that each have a session. */
export function computeBestWeeklyStreak(startedAts: number[]): number {
  if (startedAts.length === 0) return 0;
  const weeks = [...new Set(startedAts.map((t) => isoDate(startOfWeek(t))))].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < weeks.length; i++) {
    const prev = new Date(`${weeks[i - 1]}T00:00:00`).getTime();
    const cur = new Date(`${weeks[i]}T00:00:00`).getTime();
    if (cur - prev === WEEK_MS) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

/**
 * Consecutive calendar days with a session, ending today or yesterday
 * (same grace as weekly streak: missing today does not zero the run).
 */
export function computeDayStreak(dayKeys: Iterable<string>, now = Date.now()): number {
  const days = toDaySet(dayKeys);
  if (days.size === 0) return 0;
  const todayKey = isoDate(now);
  const yesterdayKey = isoDate(shiftDays(now, -1));
  if (!days.has(todayKey) && !days.has(yesterdayKey)) return 0;
  let cursor = days.has(todayKey) ? startOfDay(now) : shiftDays(now, -1);
  let streak = 0;
  while (days.has(isoDate(cursor))) {
    streak++;
    cursor = shiftDays(cursor, -1);
  }
  return streak;
}

/** Longest run of consecutive local calendar days with a session. */
export function computeBestDayStreak(dayKeys: Iterable<string>): number {
  const unique = [...toDaySet(dayKeys)].sort();
  if (unique.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < unique.length; i++) {
    const next = parseLocalDate(unique[i - 1]);
    next.setDate(next.getDate() + 1);
    if (isoDate(next.getTime()) === unique[i]) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

export interface YearFrequency {
  year: number;
  trainedDays: number;
  sessions: number;
  trainedDaysByMonth: number[];
  sessionsByMonth: number[];
}

export interface MonthFrequency {
  trainedDays: number;
  sessions: number;
}

/** Sessions and distinct trained days for a calendar year, split by month (0–11). */
export function computeYearFrequency(
  metricsByDate: Record<string, { sessions: number }>,
  year: number,
): YearFrequency {
  const trainedDaysByMonth = Array.from({ length: 12 }, () => 0);
  const sessionsByMonth = Array.from({ length: 12 }, () => 0);
  let trainedDays = 0;
  let sessions = 0;
  const prefix = `${year}-`;
  for (const [key, m] of Object.entries(metricsByDate)) {
    if (!key.startsWith(prefix)) continue;
    const month = Number(key.slice(5, 7)) - 1;
    if (month < 0 || month > 11) continue;
    const count = m.sessions ?? 0;
    if (count <= 0) continue;
    trainedDays++;
    sessions += count;
    trainedDaysByMonth[month]++;
    sessionsByMonth[month] += count;
  }
  return { year, trainedDays, sessions, trainedDaysByMonth, sessionsByMonth };
}

/** Sessions and distinct trained days for one local calendar month (`month` is 0–11). */
export function computeMonthFrequency(
  metricsByDate: Record<string, { sessions: number }>,
  year: number,
  month: number,
): MonthFrequency {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  let trainedDays = 0;
  let sessions = 0;
  for (const [key, m] of Object.entries(metricsByDate)) {
    if (!key.startsWith(prefix)) continue;
    const count = m.sessions ?? 0;
    if (count <= 0) continue;
    trainedDays++;
    sessions += count;
  }
  return { trainedDays, sessions };
}

/** Short label: days, plus sessions when a day had more than one workout. */
export function formatFrequencyLabel(freq: MonthFrequency): string {
  if (freq.trainedDays <= 0) return '0 days';
  const dayPart = `${freq.trainedDays} day${freq.trainedDays === 1 ? '' : 's'}`;
  if (freq.sessions <= freq.trainedDays) return dayPart;
  return `${dayPart} · ${freq.sessions} sessions`;
}
