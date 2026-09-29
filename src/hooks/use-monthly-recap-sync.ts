import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getMonthlyRecap, monthlyRecapNotificationBody } from '@/db/queries';
import { syncMonthlyRecapSchedule } from '@/lib/notifications/recap';
import { useSettings } from '@/store/settings-store';

/**
 * Keep the 1st-of-month recap schedule aligned with Settings + fresh copy
 * from the previous month. Time follows the Sunday digest setting so the
 * digest card needs no extra time picker.
 */
export function useMonthlyRecapSync() {
  const enabled = useSettings((s) => s.monthlyRecapEnabled);
  const hour = useSettings((s) => s.weeklyDigestHour);
  const minute = useSettings((s) => s.weeklyDigestMinute);
  const unit = useSettings((s) => s.unit);
  const syncing = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (syncing.current) return;
      syncing.current = true;
      try {
        if (cancelled) return;
        let body = 'Open Incline for your monthly training report.';
        if (enabled) {
          try {
            const now = new Date();
            const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
            const recap = await getMonthlyRecap(prevMonthStart, unit);
            body = monthlyRecapNotificationBody(recap, unit);
          } catch {
            // keep fallback body
          }
        }
        if (cancelled) return;
        await syncMonthlyRecapSchedule({ enabled, hour, minute, body });
      } finally {
        syncing.current = false;
      }
    };

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
