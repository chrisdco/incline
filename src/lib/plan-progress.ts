/**
 * Plan progress for the active program: which scheduled days were done or
 * missed, the streak, and whether the plan is finished. Pure and derived from
 * logged workouts, so there is nothing extra to store or sync.
 *
 * Calendar rules match getTodayProgramSlot: week N covers days
 * (N-1)*7 .. N*7-1 after the activation day, and a slot runs on its weekday
 * within that span. Any finished workout on a day counts for that day.
 */

export type PlanDayStatus = 'done' | 'missed' | 'today' | 'upcoming';

export interface PlanDay {
  /** Local midnight. */
  date: number;
  week: number;
  /** 1 = Monday. */
  day: number;
  status: PlanDayStatus;
}

export interface PlanProgress {
  /** Current week, 1-based; equals totalWeeks once finished. */
  week: number;
  totalWeeks: number;
  /** Scheduled days in order. */
  days: PlanDay[];
  done: number;
  scheduled: number;
  /** Scheduled days up to and including today. */
  due: number;
  /** Scheduled days done in a row, counting back from the latest due day. */
  streak: number;
  bestStreak: number;
  /** Workouts on unscheduled days (they still count, just not toward the plan). */
  extra: number;
  finished: boolean;
}

/** Local midnight `n` days after `ms`; calendar math, so DST shifts are safe. */
export function addDays(ms: number, n: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

function midnight(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function weekday(ms: number): number {
  const d = new Date(ms).getDay();
  return d === 0 ? 7 : d;
}

export function planProgress(input: {
  startedAt: number;
  weeks: number;
  schedule: { week: number; day: number }[];
  /** Start times of finished workouts (any ms within the day). */
  workouts: number[];
  now: number;
}): PlanProgress {
  const anchor = midnight(input.startedAt);
  const today = midnight(input.now);
  const totalWeeks = Math.max(1, input.weeks);
  const startDay = weekday(anchor);
  const trained = new Set(input.workouts.map(midnight));

  const keys = new Set<string>();
  const days: PlanDay[] = [];
  for (const s of input.schedule) {
    if (s.week < 1 || s.week > totalWeeks || s.day < 1 || s.day > 7) continue;
    const key = `${s.week}:${s.day}`;
    if (keys.has(key)) continue; // two routines on one day are one check-in
    keys.add(key);
    const date = addDays(anchor, (s.week - 1) * 7 + ((s.day - startDay + 7) % 7));
    const status: PlanDayStatus = trained.has(date) ? 'done' : date < today ? 'missed' : date === today ? 'today' : 'upcoming';
    days.push({ date, week: s.week, day: s.day, status });
  }
  days.sort((a, b) => a.date - b.date);

  let streak = 0;
  let bestStreak = 0;
  for (const d of days) {
    if (d.date > today) break;
    if (d.status === 'done') bestStreak = Math.max(bestStreak, ++streak);
    else if (d.status === 'missed') streak = 0;
  }

  const end = addDays(anchor, totalWeeks * 7);
  const scheduledDates = new Set(days.map((d) => d.date));
  let extra = 0;
  for (const t of trained) if (t >= anchor && t < end && !scheduledDates.has(t)) extra++;

  const elapsedWeeks = Math.floor(Math.round((today - anchor) / 86_400_000) / 7);
  const finished = today >= end;
  return {
    week: finished ? totalWeeks : Math.min(totalWeeks, Math.max(1, elapsedWeeks + 1)),
    totalWeeks,
    days,
    done: days.filter((d) => d.status === 'done').length,
    scheduled: days.length,
    due: days.filter((d) => d.date <= today).length,
    streak,
    bestStreak,
    extra,
    finished,
  };
}
