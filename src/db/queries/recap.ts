import { openDatabase } from '../client';
import {
  formatVolume,
  isoDate,
  monthBounds,
  monthKey,
  startOfDay,
  startOfMonth,
  weekBounds,
} from '../calc';
import { getCelebrationPrsInWindow } from './coaching/prs';
import type {
  MonthSeriesPoint,
  MuscleDistribution,
  MuscleGroup,
  MonthlyRecap,
  TopExerciseStat,
  Unit,
  WeeklyRecap,
} from '../types';
import { getStreak } from './progress';

const WEEK_MS = 7 * 86_400_000;
const MONTH_NARROW = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

async function twelveMonthSeries(
  db: Awaited<ReturnType<typeof openDatabase>>,
  endMonthStartMs: number,
  endMs: number,
): Promise<MonthSeriesPoint[]> {
  const end = new Date(startOfMonth(endMonthStartMs));
  const buckets: MonthSeriesPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    buckets.push({
      monthKey: monthKey(d.getTime()),
      monthStartMs: d.getTime(),
      label: MONTH_NARROW[d.getMonth()],
      sessions: 0,
      durationSeconds: 0,
      volume: 0,
      sets: 0,
    });
  }
  const seriesStart = buckets[0].monthStartMs;
  const logRows = await db.getAllAsync<{
    mk: string;
    sessions: number;
    duration: number;
    volume: number;
  }>(
    `SELECT strftime('%Y-%m', datetime(started_at / 1000, 'unixepoch', 'localtime')) as mk,
            COUNT(*) as sessions,
            COALESCE(SUM(duration_seconds), 0) as duration,
            COALESCE(SUM(total_volume), 0) as volume
     FROM workout_logs
     WHERE ended_at IS NOT NULL AND deleted_at IS NULL
       AND started_at >= ? AND started_at < ?
     GROUP BY mk`,
    seriesStart,
    endMs,
  );
  const setRows = await db.getAllAsync<{ mk: string; sets: number }>(
    `SELECT strftime('%Y-%m', datetime(w.started_at / 1000, 'unixepoch', 'localtime')) as mk,
            COUNT(s.id) as sets
     FROM set_entries s
     JOIN workout_logs w ON w.id = s.workout_log_id
     WHERE w.ended_at IS NOT NULL AND w.deleted_at IS NULL AND s.deleted_at IS NULL
       AND s.completed = 1 AND w.started_at >= ? AND w.started_at < ?
     GROUP BY mk`,
    seriesStart,
    endMs,
  );
  const logMap = new Map(logRows.map((r) => [r.mk, r]));
  const setMap = new Map(setRows.map((r) => [r.mk, r.sets]));
  return buckets.map((b) => {
    const row = logMap.get(b.monthKey);
    return {
      ...b,
      sessions: row?.sessions ?? 0,
      durationSeconds: row?.duration ?? 0,
      volume: row?.volume ?? 0,
      sets: setMap.get(b.monthKey) ?? 0,
    };
  });
}

export {
  weekBounds,
  formatWeekRangeLabel,
  monthBounds,
  formatMonthLabel,
  previousMonthStart,
  monthKey,
} from '../calc';

function weekInsightLine(input: {
  sessions: number;
  volumeLabel: string;
  volumeDeltaPct: number | null;
  prCount: number;
}): string {
  const parts = [
    `${input.sessions} session${input.sessions === 1 ? '' : 's'}`,
    input.volumeLabel,
  ];
  if (input.volumeDeltaPct !== null) {
    parts.push(`${input.volumeDeltaPct > 0 ? '+' : ''}${input.volumeDeltaPct}% vol`);
  }
  if (input.prCount > 0) {
    parts.push(`${input.prCount} PR${input.prCount === 1 ? '' : 's'}`);
  }
  if (input.sessions === 0) return 'Quiet week — a short session still counts.';
  if (input.sessions >= 4) return `Strong week · ${parts.join(' · ')}`;
  if (input.prCount > 0) return `New records · ${parts.join(' · ')}`;
  return `Your week · ${parts.join(' · ')}`;
}

function monthInsightLine(input: {
  sessions: number;
  volumeLabel: string;
  volumeDeltaPct: number | null;
  trainedDays: number;
  prCount: number;
}): string {
  const parts = [
    `${input.sessions} session${input.sessions === 1 ? '' : 's'}`,
    `${input.trainedDays} day${input.trainedDays === 1 ? '' : 's'}`,
    input.volumeLabel,
  ];
  if (input.volumeDeltaPct !== null) {
    parts.push(`${input.volumeDeltaPct > 0 ? '+' : ''}${input.volumeDeltaPct}% vol`);
  }
  if (input.prCount > 0) {
    parts.push(`${input.prCount} PR${input.prCount === 1 ? '' : 's'}`);
  }
  if (input.sessions === 0) return 'Quiet month — reset and build again.';
  if (input.sessions >= 12) return `Big month · ${parts.join(' · ')}`;
  if (input.prCount > 0) return `New records · ${parts.join(' · ')}`;
  return `Your month · ${parts.join(' · ')}`;
}

function pctDelta(current: number, previous: number, previousHadActivity: boolean): number | null {
  if (previous > 0) return Math.round(((current - previous) / previous) * 100);
  if (current > 0 && previousHadActivity) return 100;
  return null;
}

async function windowMuscles(
  db: Awaited<ReturnType<typeof openDatabase>>,
  startMs: number,
  endMs: number,
): Promise<MuscleDistribution[]> {
  const muscleRows = await db.getAllAsync<{ primary_muscle: string; sets: number; volume: number }>(
    `SELECT e.primary_muscle, COUNT(s.id) as sets, COALESCE(SUM(s.weight * s.reps), 0) as volume
     FROM set_entries s
     JOIN workout_logs w ON w.id = s.workout_log_id
     JOIN exercises e ON e.id = s.exercise_id
     WHERE w.ended_at IS NOT NULL AND w.deleted_at IS NULL AND s.deleted_at IS NULL
       AND s.completed = 1 AND w.started_at >= ? AND w.started_at < ?
     GROUP BY e.primary_muscle ORDER BY sets DESC`,
    startMs,
    endMs,
  );
  return muscleRows.map((r) => ({
    muscle: r.primary_muscle as MuscleGroup,
    sets: r.sets,
    volume: r.volume,
  }));
}

/**
 * Calendar-week recap (Monday–Sunday). Pass any timestamp in the desired week;
 * defaults to the week containing `now`.
 */
export async function getWeeklyRecap(
  weekStartMs = Date.now(),
  unit: Unit = 'metric',
): Promise<WeeklyRecap> {
  const db = await openDatabase();
  const { startMs, endMs } = weekBounds(weekStartMs);
  const prevStart = startMs - WEEK_MS;
  const weekStart = isoDate(startMs);

  const logs = await db.getAllAsync<{ started_at: number; total_volume: number }>(
    `SELECT started_at, total_volume FROM workout_logs
     WHERE ended_at IS NOT NULL AND deleted_at IS NULL
       AND started_at >= ? AND started_at < ?
     ORDER BY started_at`,
    startMs,
    endMs,
  );
  const prevLogs = await db.getAllAsync<{ started_at: number; total_volume: number }>(
    `SELECT started_at, total_volume FROM workout_logs
     WHERE ended_at IS NOT NULL AND deleted_at IS NULL
       AND started_at >= ? AND started_at < ?`,
    prevStart,
    startMs,
  );

  const sessions = logs.length;
  const totalVolume = logs.reduce((sum, l) => sum + l.total_volume, 0);
  const prevSessions = prevLogs.length;
  const prevVolume = prevLogs.reduce((sum, l) => sum + l.total_volume, 0);
  const volumeDeltaPct = pctDelta(totalVolume, prevVolume, prevSessions > 0);
  const sessionsDeltaPct = pctDelta(sessions, prevSessions, prevSessions > 0);

  const setCount = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM set_entries s
     JOIN workout_logs w ON w.id = s.workout_log_id
     WHERE w.ended_at IS NOT NULL AND w.deleted_at IS NULL AND s.deleted_at IS NULL
       AND s.completed = 1 AND w.started_at >= ? AND w.started_at < ?`,
    startMs,
    endMs,
  );

  const muscles = await windowMuscles(db, startMs, endMs);
  const prs = await getCelebrationPrsInWindow(startMs, endMs, 8);
  const volumeLabel = formatVolume(totalVolume, unit);
  const line = weekInsightLine({
    sessions,
    volumeLabel,
    volumeDeltaPct,
    prCount: prs.length,
  });

  return {
    weekStart,
    weekStartMs: startMs,
    weekEndMs: endMs,
    sessions,
    totalVolume,
    totalSets: setCount?.c ?? 0,
    streak: await getStreak(),
    volumeDeltaPct,
    sessionsDeltaPct,
    prs,
    muscles,
    insightLine: line,
  };
}

/** Short notification body for the Sunday digest. */
export function weeklyDigestNotificationBody(recap: WeeklyRecap, unit: Unit): string {
  if (recap.sessions === 0) {
    return 'Quiet week so far — a short session still counts.';
  }
  const volumeLabel = formatVolume(recap.totalVolume, unit);
  return `${recap.sessions} session${recap.sessions === 1 ? '' : 's'} · ${volumeLabel}. ${recap.insightLine}`;
}

/**
 * Calendar-month recap. Pass any timestamp in the desired month;
 * defaults to the month containing `now`.
 */
export async function getMonthlyRecap(
  monthStartMs = Date.now(),
  unit: Unit = 'metric',
): Promise<MonthlyRecap> {
  const db = await openDatabase();
  const { startMs, endMs } = monthBounds(monthStartMs);
  const prev = monthBounds(startMs - 1);
  const key = monthKey(startMs);

  const logs = await db.getAllAsync<{
    started_at: number;
    total_volume: number;
    duration_seconds: number;
  }>(
    `SELECT started_at, total_volume, duration_seconds FROM workout_logs
     WHERE ended_at IS NOT NULL AND deleted_at IS NULL
       AND started_at >= ? AND started_at < ?
     ORDER BY started_at`,
    startMs,
    endMs,
  );
  const prevLogs = await db.getAllAsync<{
    started_at: number;
    total_volume: number;
    duration_seconds: number;
  }>(
    `SELECT started_at, total_volume, duration_seconds FROM workout_logs
     WHERE ended_at IS NOT NULL AND deleted_at IS NULL
       AND started_at >= ? AND started_at < ?`,
    prev.startMs,
    prev.endMs,
  );

  const sessions = logs.length;
  const totalVolume = logs.reduce((sum, l) => sum + l.total_volume, 0);
  const durationSeconds = logs.reduce((sum, l) => sum + (l.duration_seconds ?? 0), 0);
  const prevSessions = prevLogs.length;
  const prevVolume = prevLogs.reduce((sum, l) => sum + l.total_volume, 0);
  const previousDurationSeconds = prevLogs.reduce((sum, l) => sum + (l.duration_seconds ?? 0), 0);
  const volumeDeltaPct = pctDelta(totalVolume, prevVolume, prevSessions > 0);
  const sessionsDeltaPct = pctDelta(sessions, prevSessions, prevSessions > 0);

  const daySet = new Set<number>();
  for (const l of logs) daySet.add(startOfDay(l.started_at));
  const trainedDayMs = [...daySet].sort((a, b) => a - b);

  const setCount = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM set_entries s
     JOIN workout_logs w ON w.id = s.workout_log_id
     WHERE w.ended_at IS NOT NULL AND w.deleted_at IS NULL AND s.deleted_at IS NULL
       AND s.completed = 1 AND w.started_at >= ? AND w.started_at < ?`,
    startMs,
    endMs,
  );
  const prevSetCount = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM set_entries s
     JOIN workout_logs w ON w.id = s.workout_log_id
     WHERE w.ended_at IS NOT NULL AND w.deleted_at IS NULL AND s.deleted_at IS NULL
       AND s.completed = 1 AND w.started_at >= ? AND w.started_at < ?`,
    prev.startMs,
    prev.endMs,
  );

  const muscles = await windowMuscles(db, startMs, endMs);
  const previousMuscles = await windowMuscles(db, prev.startMs, prev.endMs);
  const prs = await getCelebrationPrsInWindow(startMs, endMs, 10);

  const topRows = await db.getAllAsync<{
    exerciseId: number;
    name: string;
    sets: number;
    volume: number;
  }>(
    `SELECT e.id as exerciseId, e.name, COUNT(s.id) as sets, COALESCE(SUM(s.weight * s.reps), 0) as volume
     FROM set_entries s
     JOIN workout_logs w ON w.id = s.workout_log_id
     JOIN exercises e ON e.id = s.exercise_id
     WHERE w.ended_at IS NOT NULL AND w.deleted_at IS NULL AND s.deleted_at IS NULL
       AND s.completed = 1 AND w.started_at >= ? AND w.started_at < ?
     GROUP BY e.id ORDER BY volume DESC LIMIT 5`,
    startMs,
    endMs,
  );
  const topExercises: TopExerciseStat[] = topRows.map((r) => ({
    exerciseId: r.exerciseId,
    exerciseName: r.name,
    sets: r.sets,
    volume: r.volume,
  }));

  const volumeLabel = formatVolume(totalVolume, unit);
  const line = monthInsightLine({
    sessions,
    volumeLabel,
    volumeDeltaPct,
    trainedDays: trainedDayMs.length,
    prCount: prs.length,
  });

  return {
    monthKey: key,
    monthStartMs: startMs,
    monthEndMs: endMs,
    sessions,
    totalVolume,
    totalSets: setCount?.c ?? 0,
    durationSeconds,
    streak: await getStreak(),
    trainedDays: trainedDayMs.length,
    volumeDeltaPct,
    sessionsDeltaPct,
    previousSessions: prevSessions,
    previousVolume: prevVolume,
    previousSets: prevSetCount?.c ?? 0,
    previousDurationSeconds,
    prs,
    muscles,
    previousMuscles,
    topExercises,
    trainedDayMs,
    insightLine: line,
    yearSeries: await twelveMonthSeries(db, startMs, endMs),
  };
}

export function monthlyRecapNotificationBody(recap: MonthlyRecap, unit: Unit): string {
  if (recap.sessions === 0) {
    return 'Quiet month — open Incline to plan the next one.';
  }
  const volumeLabel = formatVolume(recap.totalVolume, unit);
  return `${recap.sessions} sessions · ${volumeLabel}. ${recap.insightLine}`;
}
