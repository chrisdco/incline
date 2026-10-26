import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { syncWorkoutReminderSchedules } from '@/lib/notifications/reminders';
import { runExclusive } from '@/lib/run-exclusive';
import { useSettings } from '@/store/settings-store';

/**
 * Keep OS weekly reminder schedules aligned with Settings prefs.
 * Runs on mount, prefs change, and return to foreground (OS may drop schedules).
 */
export function useWorkoutReminderSync() {
  const enabled = useSettings((s) => s.workoutRemindersEnabled);
  const days = useSettings((s) => s.workoutReminderDays);
  const hour = useSettings((s) => s.workoutReminderHour);
  const minute = useSettings((s) => s.workoutReminderMinute);
  const syncing = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const run = () =>
      runExclusive(syncing, async () => {
        if (cancelled) return;
        await syncWorkoutReminderSchedules({ enabled, days, hour, minute });
      });

    void run();

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') void run();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [enabled, days, hour, minute]);
}
