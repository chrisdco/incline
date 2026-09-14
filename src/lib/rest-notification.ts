import { Platform } from 'react-native';

import { cancelNotification, prepareNotifications } from '@/lib/notifications/core';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_IDS,
  type NotificationPayload,
} from '@/lib/notifications/types';

/** Schedule (or replace) a local alert that fires when rest should end. */
export async function scheduleRestCompleteNotification(
  seconds: number,
  opts?: { sessionId?: number },
): Promise<void> {
  if (seconds < 1) return;
  const mod = await prepareNotifications(NOTIFICATION_CHANNELS.restTimer);
  if (!mod) return;
  try {
    await cancelNotification(NOTIFICATION_IDS.restComplete);
    const data: NotificationPayload = { type: 'rest_complete', sessionId: opts?.sessionId } as NotificationPayload;
    await mod.scheduleNotificationAsync({
      identifier: NOTIFICATION_IDS.restComplete,
      content: {
        title: 'Rest complete',
        body: 'Time for your next set.',
        sound: 'default',
        data,
      },
      trigger: {
        type: mod.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(seconds)),
        repeats: false,
        ...(Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNELS.restTimer } : {}),
      },
    });
  } catch {
    // Permissions / unsupported env — ignore
  }
}

/** Cancel any pending rest-complete alert. */
export async function cancelRestCompleteNotification(): Promise<void> {
  await cancelNotification(NOTIFICATION_IDS.restComplete);
}
