import { describe, expect, it } from 'vitest';

import {
  buildMonthProps,
  buildQuickStartProps,
  buildRoutinesProps,
  buildStreakProps,
  buildVolumeChartProps,
  formatDelta,
  formatWidgetDuration,
} from '@/lib/widgets/build-extra';
import type { WidgetPalette } from '@/lib/widgets/types';

const p: WidgetPalette = {
  background: '#fff',
  card: '#fff',
  foreground: '#000',
  muted: '#666',
  primary: '#60f',
  border: '#eee',
};
const palettes = { light: p, dark: p };
const NOW = new Date(2026, 9, 22, 18, 40).getTime(); // Thu 22 Oct 2026
const kg = (v: number) => `${v} kg`;

describe('widget extras', () => {
  it('quick start resumes a running session instead of starting another', () => {
    const resume = buildQuickStartProps({ activeSessionId: 7, todayName: 'Push', ...palettes });
    expect(resume.url).toBe('incline:///session/7');
    expect(resume.resume).toBe(true);
    const start = buildQuickStartProps({ activeSessionId: null, todayName: 'Push', ...palettes });
    expect(start.url).toBe('incline:///start');
    expect(start.eyebrow).toBe('Today · Push');
  });

  it('streak caption says what keeps it alive', () => {
    expect(buildStreakProps({ streak: 0, best: 3, trainedThisWeek: false, ...palettes }).caption).toBe(
      'Train this week to start one',
    );
    expect(buildStreakProps({ streak: 4, best: 9, trainedThisWeek: false, ...palettes }).caption).toBe(
      'Train this week to keep it',
    );
    expect(buildStreakProps({ streak: 9, best: 9, trainedThisWeek: true, ...palettes }).caption).toBe('Personal best');
    expect(buildStreakProps({ streak: 1, best: 1, trainedThisWeek: true, ...palettes }).unit).toBe('week');
  });

  it('month grid is Monday-first with trained days and today marked', () => {
    const props = buildMonthProps({
      monthStart: new Date(2026, 9, 1).getTime(), // Thu
      trainedDates: [1, 22],
      workouts: 2,
      durationSec: 5400,
      volume: 1000,
      prevWorkouts: 1,
      prevDurationSec: 7200,
      prevVolume: 0,
      now: NOW,
      formatVolume: kg,
      ...palettes,
    });
    expect(props.title).toBe('October');
    expect(props.weeks[0].slice(0, 4).map((c) => c.label)).toEqual(['', '', '', '1']);
    expect(props.weeks.every((w) => w.length === 7)).toBe(true);
    const flat = props.weeks.flat();
    expect(flat.find((c) => c.label === '22')).toEqual({ label: '22', trained: true, isToday: true });
    expect(props.stats.map((s) => s.delta)).toEqual(['▲ 1', '▼ 30m', '']);
  });

  it('volume bars scale to the biggest day and label weekdays ending today', () => {
    const props = buildVolumeChartProps({ dailyVolume: [0, 100, 0, 0, 50, 0, 200], now: NOW, formatVolume: kg, ...palettes });
    expect(props.total).toBe('350 kg');
    expect(props.bars.map((b) => b.letter).join('')).toBe('FSSMTWT');
    expect(props.bars[6]).toEqual({ ratio: 1, letter: 'T', isToday: true });
    expect(props.bars[0].ratio).toBe(0);
    expect(props.bars[4].ratio).toBe(0.25);
  });

  it('routines pad to a square 2-column grid', () => {
    const props = buildRoutinesProps({ routines: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }], ...palettes });
    expect(props.rows).toHaveLength(2);
    expect(props.rows[1][1].url).toBe('');
    expect(props.rows[0][0].url).toBe('incline:///workout/1');
    expect(buildRoutinesProps({ routines: [], ...palettes }).empty).toBe('Create a routine in Incline');
  });

  it('formats deltas and durations compactly', () => {
    expect(formatDelta(5, 5, String)).toBe('');
    expect(formatDelta(3, 0, String)).toBe('');
    expect(formatWidgetDuration(45 * 60)).toBe('45m');
    expect(formatWidgetDuration(16 * 3600 + 35 * 60)).toBe('16h 35m');
  });
});

/** Nulls inside arrays crash the native Widget constructor on launch (alpha 3). */
function nestedNullPaths(value: unknown, path = '', inArray = false): string[] {
  if (value === null) return inArray ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => nestedNullPaths(v, `${path}[${i}]`, true));
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      nestedNullPaths(v, `${path}.${k}`, inArray),
    );
  }
  return [];
}

describe('widget props are safe for the native bridge', () => {
  it('never put null inside an array', () => {
    const month = buildMonthProps({
      monthStart: new Date(2026, 9, 1).getTime(),
      trainedDates: [],
      workouts: 0,
      durationSec: 0,
      volume: 0,
      prevWorkouts: 0,
      prevDurationSec: 0,
      prevVolume: 0,
      now: NOW,
      formatVolume: kg,
      ...palettes,
    });
    const routines = buildRoutinesProps({ routines: [{ id: 1, name: 'A' }], ...palettes });
    const bars = buildVolumeChartProps({ dailyVolume: [0, 0, 0, 0, 0, 0, 0], now: NOW, formatVolume: kg, ...palettes });
    expect([month, routines, bars].flatMap((p) => nestedNullPaths(p))).toEqual([]);
  });
});
