/**
 * Snapshot builders for the secondary widgets: Quick start, Streak, Month,
 * Volume chart and Routines. Pure and unit-tested, like build-next-up —
 * the widget runtime only receives these props.
 *
 * Every widget carries the deep link its tap opens (`open:` targets are
 * handled by the expo-widgets patch in patches/).
 */
import { plural, type WidgetPalettes } from './types';

export const WIDGET_LINKS = {
  home: 'incline:///',
  start: 'incline:///start',
  calendar: 'incline:///calendar',
  progress: 'incline:///progress',
  session: (id: number) => `incline:///session/${id}`,
  routine: (id: number) => `incline:///workout/${id}`,
} as const;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const LETTERS_SUN_FIRST = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** "▲ 4" / "▼ 2h 05m" / null when there is nothing to compare against. */
export function formatDelta(cur: number, prev: number, fmt: (v: number) => string): string | null {
  if (prev <= 0 || cur === prev) return null;
  return `${cur > prev ? '▲' : '▼'} ${fmt(Math.abs(cur - prev))}`;
}

/** Widget-sized duration: "45m", "16h 35m". */
export function formatWidgetDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

// ---------- Quick start (2x1) ----------

export interface QuickStartProps extends WidgetPalettes {
  eyebrow: string;
  title: string;
  url: string;
  resume: boolean;
}

export function buildQuickStartProps(
  input: {
    activeSessionId: number | null;
    todayName: string | null;
  } & WidgetPalettes,
): QuickStartProps {
  if (input.activeSessionId != null) {
    return {
      eyebrow: 'In progress',
      title: 'Resume',
      url: WIDGET_LINKS.session(input.activeSessionId),
      resume: true,
      light: input.light,
      dark: input.dark,
    };
  }
  return {
    eyebrow: input.todayName ? `Today · ${input.todayName}` : 'Quick start',
    title: 'Start workout',
    url: WIDGET_LINKS.start,
    resume: false,
    light: input.light,
    dark: input.dark,
  };
}

// ---------- Streak (2x1) ----------

export interface StreakProps extends WidgetPalettes {
  value: string;
  unit: string;
  caption: string;
  active: boolean;
}

export function buildStreakProps(
  input: {
    streak: number;
    best: number;
    trainedThisWeek: boolean;
  } & WidgetPalettes,
): StreakProps {
  const { streak, best, trainedThisWeek } = input;
  let caption = 'Train this week to start one';
  if (streak > 0 && !trainedThisWeek) caption = 'Train this week to keep it';
  else if (streak > 0 && streak >= best) caption = 'Personal best';
  else if (streak > 0) caption = `Best ${best} ${plural(best, 'week')}`;
  return {
    value: String(streak),
    unit: plural(streak, 'week'),
    caption,
    active: streak > 0,
    light: input.light,
    dark: input.dark,
  };
}

// ---------- Month calendar + stats (4x2) ----------

export interface MonthCell {
  /** Empty string for a leading/trailing blank. */
  label: string;
  trained: boolean;
  isToday: boolean;
}

export interface MonthStat {
  value: string;
  label: string;
  delta: string | null;
  up: boolean;
}

export interface MonthProps extends WidgetPalettes {
  title: string;
  weekdayLetters: string[];
  /** Rows of 7, Monday first. */
  weeks: MonthCell[][];
  stats: MonthStat[];
}

export function buildMonthProps(
  input: {
    monthStart: number;
    trainedDates: number[];
    workouts: number;
    durationSec: number;
    volume: number;
    prevWorkouts: number;
    prevDurationSec: number;
    prevVolume: number;
    now: number;
    formatVolume: (kg: number) => string;
  } & WidgetPalettes,
): MonthProps {
  const start = new Date(input.monthStart);
  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const lead = (start.getDay() + 6) % 7; // Monday-first offset
  const today = new Date(input.now);
  const sameMonth =
    today.getFullYear() === start.getFullYear() && today.getMonth() === start.getMonth();
  const trained = new Set(input.trainedDates);

  const cells: MonthCell[] = [];
  for (let i = 0; i < lead; i++) cells.push({ label: '', trained: false, isToday: false });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      label: String(d),
      trained: trained.has(d),
      isToday: sameMonth && today.getDate() === d,
    });
  }
  while (cells.length % 7 !== 0) cells.push({ label: '', trained: false, isToday: false });
  const weeks: MonthCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const stat = (
    cur: number,
    prev: number,
    value: string,
    label: string,
    fmt: (v: number) => string,
  ): MonthStat => ({
    value,
    label,
    delta: formatDelta(cur, prev, fmt),
    up: cur >= prev,
  });

  return {
    title: MONTHS[start.getMonth()],
    weekdayLetters: [...LETTERS_SUN_FIRST.slice(1), LETTERS_SUN_FIRST[0]],
    weeks,
    stats: [
      stat(
        input.workouts,
        input.prevWorkouts,
        String(input.workouts),
        plural(input.workouts, 'Workout'),
        String,
      ),
      stat(
        input.durationSec,
        input.prevDurationSec,
        formatWidgetDuration(input.durationSec),
        'Duration',
        formatWidgetDuration,
      ),
      stat(
        input.volume,
        input.prevVolume,
        input.formatVolume(input.volume),
        'Volume',
        input.formatVolume,
      ),
    ],
    light: input.light,
    dark: input.dark,
  };
}

// ---------- Volume chart (2x2) ----------

export interface VolumeBar {
  /** 0..1 of the tallest day; trained days get at least a sliver. */
  ratio: number;
  letter: string;
  isToday: boolean;
}

export interface VolumeChartProps extends WidgetPalettes {
  total: string;
  caption: string;
  bars: VolumeBar[];
}

export function buildVolumeChartProps(
  input: {
    dailyVolume: number[];
    now: number;
    formatVolume: (kg: number) => string;
  } & WidgetPalettes,
): VolumeChartProps {
  const max = Math.max(0, ...input.dailyVolume);
  const total = input.dailyVolume.reduce((a, b) => a + b, 0);
  const todayDow = new Date(input.now).getDay();
  return {
    total: input.formatVolume(total),
    caption: 'Last 7 days',
    bars: input.dailyVolume.map((v, i) => ({
      ratio: max > 0 && v > 0 ? Math.max(0.08, v / max) : 0,
      letter: LETTERS_SUN_FIRST[(todayDow - 6 + i + 7) % 7],
      isToday: i === input.dailyVolume.length - 1,
    })),
    light: input.light,
    dark: input.dark,
  };
}

// ---------- Routines (4x3) ----------

export interface RoutineTile {
  name: string;
  /** null = blank filler keeping the 2-column grid square. */
  url: string | null;
}

export interface RoutinesProps extends WidgetPalettes {
  title: string;
  /** Rows of two tiles. */
  rows: RoutineTile[][];
  empty: string | null;
}

export function buildRoutinesProps(
  input: { routines: { id: number; name: string }[] } & WidgetPalettes,
): RoutinesProps {
  const tiles: RoutineTile[] = input.routines
    .slice(0, 6)
    .map((r) => ({ name: r.name, url: WIDGET_LINKS.routine(r.id) }));
  if (tiles.length % 2 === 1) tiles.push({ name: '', url: null });
  const rows: RoutineTile[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
  return {
    title: 'Routines',
    rows,
    empty: rows.length === 0 ? 'Create a routine in Incline' : null,
    light: input.light,
    dark: input.dark,
  };
}
