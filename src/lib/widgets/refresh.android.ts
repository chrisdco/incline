/**
 * Push fresh snapshots to the Android home-screen widgets.
 *
 * Widgets cannot poll and cannot run app code (the runtime is isolated), so
 * values are written at the same places the app already invalidates its own
 * views — app start/foreground plus session/program/template writes and
 * settings changes (see `useWidgetRefresh`), never on a timer.
 */
import { isRunningInExpoGo } from 'expo';

import { getTodayProgramSlot } from '@/db/queries/programs';
import { getWeeklyConsistency } from '@/db/queries/progress';
import { getActiveWorkoutSummary } from '@/db/queries/sessions';
import { getSuggestedTemplate } from '@/db/queries/templates';
import { useSettings } from '@/store/settings-store';

import { buildNextUpProps } from './build-next-up';
import { buildThisWeekProps } from './build-this-week';
import { createLatestRunner } from './latest-runner';
import { widgetPalettes } from './palette';

async function pushSnapshots(now: number): Promise<void> {
  try {
    const settings = useSettings.getState();
    const [active, todaySlot, consistency, suggested] = await Promise.all([
      getActiveWorkoutSummary(),
      getTodayProgramSlot(now),
      getWeeklyConsistency(settings.weeklyWorkoutGoal, now, { includeBestStreak: false }),
      getSuggestedTemplate(),
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
        activeSession: active ? { name: active.name, startedAt: active.startedAt } : null,
        today,
        suggested: suggested ? { name: suggested.name } : null,
        sessionsThisWeek: consistency.sessionsThisWeek,
        weeklyGoal: consistency.goal,
        streak: consistency.currentWeeklyStreak,
        now,
        ...palettes,
      }),
    );

    ThisWeek.updateSnapshot(
      buildThisWeekProps({
        sessionsThisWeek: consistency.sessionsThisWeek,
        weeklyGoal: consistency.goal,
        sessionsToGoal: consistency.sessionsToGoal,
        goalMet: consistency.goalMet,
        ...palettes,
      }),
    );
  } catch {
    // Widgets are a bonus surface — a failure here must never reach the app.
  }
}

/** One run at a time; bursts coalesce to the newest snapshot. */
const pushLatest = createLatestRunner(pushSnapshots);

export async function refreshWidgets(now = Date.now()): Promise<void> {
  if (isRunningInExpoGo()) return;
  await pushLatest(now);
}
