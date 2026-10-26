import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getWeeklyRecap, weeklyDigestNotificationBody } from '@/db/queries';
import { syncWeeklyDigestSchedule } from '@/lib/notifications/digest';
import { runExclusive } from '@/lib/run-exclusive';
import { useSettings } from '@/store/settings-store';

/**
 * Keep the Sunday digest schedule aligned with Settings + fresh week copy.
 */
export function useWeeklyDigestSync() {
  const enabled = useSettings((s) => s.weeklyDigestEnabled);
  const hour = useSettings((s) => s.weeklyDigestHour);
  const minute = useSettings((s) => s.weeklyDigestMinute);
  const unit = useSettings((s) => s.unit);
  const syncing = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const run = () =>
      runExclusive(syncing, async () => {
        if (cancelled) return;
        let body = 'Open Incline for your weekly training report.';
        if (enabled) {
          try {
            const recap = await getWeeklyRecap(Date.now(), unit);
            body = weeklyDigestNotificationBody(recap, unit);
          } catch {
            // keep fallback body
          }
        }
        if (cancelled) return;
        await syncWeeklyDigestSchedule({ enabled, hour, minute, body });
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
  }, [enabled, hour, minute, unit]);
}
