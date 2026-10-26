import { Platform } from 'react-native';
import type { DateTriggerInput } from 'expo-notifications';

import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/actions';
import {
  cancelNotification,
  dismissNotification,
  prepareNotifications,
} from '@/lib/notifications/core';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_IDS,
  type NotificationPayload,
} from '@/lib/notifications/types';

/**
 * The in-app countdown is the primary cue while the app is open. Give it a
 * beat to cancel the scheduled alert when it hits zero so an OS notification
 * cannot double-fire next to the in-app chime. Two seconds is imperceptible
 * when the app is backgrounded and closes the race when it is foregrounded.
 */
const REST_COMPLETE_GRACE_MS = 2_000;

/**
 * Schedule (or replace) a local alert that fires when rest should end.
 *
 * Android uses a wall-clock DATE trigger with `delivery: 'alarmClock'` so the
 * alert is not deferred by Doze/battery optimisation — a rest alert that
 * arrives a minute late has already failed. That needs `SCHEDULE_EXACT_ALARM`
 * (declared in app.json); without the grant Android falls back to best-effort
 * delivery, which is what the "Precise rest alerts" settings row fixes.
 */
export async function scheduleRestCompleteNotification(
  seconds: number,
  opts?: { sessionId?: number },
): Promise<void> {
  if (seconds < 1) return;
  const mod = await prepareNotifications(NOTIFICATION_CHANNELS.restTimer);
  if (!mod) return;
  try {
    await cancelNotification(NOTIFICATION_IDS.restComplete);
    // Starting a new rest should also clear a stale alert still in the shade.
    await dismissNotification(NOTIFICATION_IDS.restComplete);
    const data: NotificationPayload = { type: 'rest_complete', sessionId: opts?.sessionId };
    const trigger: DateTriggerInput = {
      type: mod.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + Math.round(seconds) * 1000 + REST_COMPLETE_GRACE_MS),
      ...(Platform.OS === 'android'
        ? { channelId: NOTIFICATION_CHANNELS.restTimer, delivery: 'alarmClock' as const }
        : {}),
    };
    await mod.scheduleNotificationAsync({
      identifier: NOTIFICATION_IDS.restComplete,
      content: {
        title: 'Rest complete',
        body: 'Time for your next set.',
        sound: 'default',
        data,
        categoryIdentifier: NOTIFICATION_CATEGORIES.rest,
      },
      trigger,
    });
  } catch {
    // Permissions / unsupported env — ignore
  }
}

/** Cancel any pending rest-complete alert. */
export async function cancelRestCompleteNotification(): Promise<void> {
  await cancelNotification(NOTIFICATION_IDS.restComplete);
}

/** Remove a rest alert already shown in the shade or on the lock screen. */
export async function dismissRestCompleteNotification(): Promise<void> {
  await dismissNotification(NOTIFICATION_IDS.restComplete);
}

/** Cancel a pending alert and clear a presented one (stop/completion path). */
export async function clearRestCompleteNotification(): Promise<void> {
  await cancelRestCompleteNotification();
  await dismissRestCompleteNotification();
}
