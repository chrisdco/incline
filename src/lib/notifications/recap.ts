import { Platform } from 'react-native';

import { cancelNotification, prepareNotifications } from '@/lib/notifications/core';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_IDS,
  type NotificationPayload,
} from '@/lib/notifications/types';

export type MonthlyRecapPrefs = {
  enabled: boolean;
  hour: number;
  minute: number;
  /** Notification body; refreshed on sync from the previous month's recap. */
  body: string;
};

export async function cancelMonthlyRecap(): Promise<void> {
  await cancelNotification(NOTIFICATION_IDS.monthlyRecap);
}

/**
 * Monthly recap on the 1st, same digests channel as the Sunday ping.
 * Idempotent cancel → optionally reschedule, mirroring the weekly digest.
 */
export async function syncMonthlyRecapSchedule(prefs: MonthlyRecapPrefs): Promise<boolean> {
  await cancelMonthlyRecap();
  if (!prefs.enabled) return true;

  const mod = await prepareNotifications(NOTIFICATION_CHANNELS.digests);
  if (!mod) return false;

  const hour = Math.min(23, Math.max(0, Math.round(prefs.hour)));
  const minute = Math.min(59, Math.max(0, Math.round(prefs.minute)));
  const data: NotificationPayload = { type: 'monthly_recap' };

  try {
    await mod.scheduleNotificationAsync({
      identifier: NOTIFICATION_IDS.monthlyRecap,
      content: {
        title: 'Your month on Incline',
        body: prefs.body || 'Open Incline for your monthly training report.',
        sound: 'default',
        data,
      },
      trigger: {
        type: mod.SchedulableTriggerInputTypes.MONTHLY,
        day: 1,
        hour,
        minute,
        ...(Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNELS.digests } : {}),
      },
    });
    return true;
  } catch {
    return false;
  }
}
