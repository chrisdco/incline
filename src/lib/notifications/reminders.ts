import { Platform } from 'react-native';

import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/actions';
import { reminderBodyForDay } from '@/lib/notifications/copy';
import {
  cancelNotification,
  prepareNotifications,
} from '@/lib/notifications/core';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_IDS,
  jsWeekdayToExpo,
  type NotificationPayload,
} from '@/lib/notifications/types';

export type WorkoutReminderPrefs = {
  enabled: boolean;
  /** JS weekdays Sunday=0 … Saturday=6 */
  days: number[];
  hour: number;
  minute: number;
};

const ALL_JS_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export { reminderBodyForDay } from '@/lib/notifications/copy';

/** Cancel every weekday reminder slot (enabled or not). */
export async function cancelWorkoutReminders(): Promise<void> {
  await Promise.all(ALL_JS_WEEKDAYS.map((d) => cancelNotification(NOTIFICATION_IDS.reminderDay(d))));
}

/**
 * Idempotent: cancel all reminder slots, then schedule weekly triggers for
 * each selected day. Safe to call on prefs change and app foreground.
 */
export async function syncWorkoutReminderSchedules(prefs: WorkoutReminderPrefs): Promise<boolean> {
  await cancelWorkoutReminders();
  if (!prefs.enabled || prefs.days.length === 0) return true;

  const mod = await prepareNotifications(NOTIFICATION_CHANNELS.workoutReminders);
  if (!mod) return false;

  const hour = Math.min(23, Math.max(0, Math.round(prefs.hour)));
  const minute = Math.min(59, Math.max(0, Math.round(prefs.minute)));
  const uniqueDays = [...new Set(prefs.days.filter((d) => d >= 0 && d <= 6))];

  const data: NotificationPayload = { type: 'workout_reminder' };

  try {
    await Promise.all(
      uniqueDays.map(async (jsDay) => {
        await mod.scheduleNotificationAsync({
          identifier: NOTIFICATION_IDS.reminderDay(jsDay),
          content: {
            title: 'Time to train',
            body: reminderBodyForDay(jsDay),
            sound: 'default',
            data,
            categoryIdentifier: NOTIFICATION_CATEGORIES.reminder,
          },
          trigger: {
            type: mod.SchedulableTriggerInputTypes.WEEKLY,
            weekday: jsWeekdayToExpo(jsDay),
            hour,
            minute,
            ...(Platform.OS === 'android'
              ? { channelId: NOTIFICATION_CHANNELS.workoutReminders }
              : {}),
          },
        });
      }),
    );
    return true;
  } catch {
    return false;
  }
}
