/**
 * Push fresh snapshots to the Android home-screen widgets.
 *
 * Widgets cannot poll and cannot run app code (the runtime is isolated), so
 * values are written when the data they render changes — app start/foreground,
 * table-change events from SQLite, and settings changes (see
 * `useWidgetRefresh`), never on a timer.
 */
import { isRunningInExpoGo } from 'expo';

import { getTodayProgramSlot } from '@/db/queries/programs';
import { formatVolume } from '@/db/calc';
import {
  getWeeklyConsistency,
  getWidgetExtraStats,
  getWidgetWeekStats,
} from '@/db/queries/progress';
import { getActiveWorkout } from '@/db/queries/sessions';
import { getSuggestedTemplate } from '@/db/queries/templates';
import { useSettings } from '@/store/settings-store';

import {
  buildMonthProps,
  buildQuickStartProps,
  buildRoutinesProps,
  buildStreakProps,
  buildVolumeChartProps,
} from './build-extra';
import { buildNextUpProps } from './build-next-up';
import { buildThisWeekProps } from './build-this-week';
import { widgetPalettes } from './palette';

let inFlight = false;
let rerun = false;

export async function refreshWidgets(now = Date.now()): Promise<void> {
  if (isRunningInExpoGo()) return;
  // A call landing mid-refresh re-runs once afterwards instead of being
  // dropped, so the snapshot always ends on the latest committed state.
  if (inFlight) {
    rerun = true;
    return;
  }
  inFlight = true;
  try {
    const settings = useSettings.getState();
    const [active, todaySlot, consistency, suggested, week, extra] = await Promise.all([
      getActiveWorkout(),
      getTodayProgramSlot(now),
      getWeeklyConsistency(settings.weeklyWorkoutGoal, now),
      getSuggestedTemplate(),
      getWidgetWeekStats(now),
      getWidgetExtraStats(now),
    ]);

    // Lazy require: the widget runtime (and @expo/ui/jetpack-compose) must not
    // reach the web/iOS bundles, and keeping it out of the module graph until
    // the first Android refresh also keeps Expo Go imports safe.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: NextUp } = require('@/widgets/next-up') as typeof import('@/widgets/next-up');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: ThisWeek } = require('@/widgets/this-week') as typeof import('@/widgets/this-week');

    const today =
      todaySlot && !todaySlot.isRestDay && todaySlot.workout
        ? {
            templateName: todaySlot.workout.templateName ?? 'Workout',
            week: todaySlot.week,
            estimatedMinutes:
              todaySlot.workout.estimatedMinutes && todaySlot.workout.estimatedMinutes > 0
                ? todaySlot.workout.estimatedMinutes
                : null,
          }
        : null;

    const palettes = widgetPalettes(settings.accentTheme);

    NextUp.updateSnapshot(
      buildNextUpProps({
        activeSession: active
          ? { id: active.id, name: active.name, startedAt: active.startedAt }
          : null,
        today,
        suggested: suggested ? { name: suggested.name } : null,
        sessionsThisWeek: consistency.sessionsThisWeek,
        weeklyGoal: consistency.goal,
        streak: consistency.currentWeeklyStreak,
        now,
        volumeThisWeek: week.volumeThisWeek,
        volumeLastWeek: week.volumeLastWeek,
        formatVolume: (kg) => formatVolume(kg, settings.unit),
        ...palettes,
      }),
    );

    ThisWeek.updateSnapshot(
      buildThisWeekProps({
        sessionsThisWeek: consistency.sessionsThisWeek,
        weeklyGoal: consistency.goal,
        sessionsToGoal: consistency.sessionsToGoal,
        goalMet: consistency.goalMet,
        trainedDays: week.trainedDays,
        todayIndex: week.todayIndex,
        ...palettes,
      }),
    );

    const fmtVolume = (kg: number) => formatVolume(kg, settings.unit);
    /* eslint-disable @typescript-eslint/no-require-imports */
    const widgets = {
      QuickStart: (require('@/widgets/quick-start') as typeof import('@/widgets/quick-start')).default,
      Streak: (require('@/widgets/streak') as typeof import('@/widgets/streak')).default,
      Month: (require('@/widgets/month') as typeof import('@/widgets/month')).default,
      VolumeChart: (require('@/widgets/volume-chart') as typeof import('@/widgets/volume-chart'))
        .default,
      Routines: (require('@/widgets/routines') as typeof import('@/widgets/routines')).default,
    };
    /* eslint-enable @typescript-eslint/no-require-imports */

    widgets.QuickStart.updateSnapshot(
      buildQuickStartProps({
        activeSessionId: active?.id ?? null,
        todayName: today?.templateName ?? null,
        ...palettes,
      }),
    );
    widgets.Streak.updateSnapshot(
      buildStreakProps({
        streak: consistency.currentWeeklyStreak,
        best: consistency.bestWeeklyStreak,
        trainedThisWeek: consistency.sessionsThisWeek > 0,
        ...palettes,
      }),
    );
    widgets.Month.updateSnapshot(
      buildMonthProps({ ...extra.month, now, formatVolume: fmtVolume, ...palettes }),
    );
    widgets.VolumeChart.updateSnapshot(
      buildVolumeChartProps({ dailyVolume: extra.dailyVolume, now, formatVolume: fmtVolume, ...palettes }),
    );
    widgets.Routines.updateSnapshot(buildRoutinesProps({ routines: extra.routines, ...palettes }));
  } catch {
    // Widgets are a bonus surface — a failure here must never reach the app.
  } finally {
    inFlight = false;
    if (rerun) {
      rerun = false;
      void refreshWidgets();
    }
  }
}
