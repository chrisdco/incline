import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';

import {
  NOTIFICATION_CHANNELS,
  type NotificationChannelId,
} from '@/lib/notifications/types';

/**
 * Android Expo Go throws on import of expo-notifications (push token APIs were
 * removed in SDK 53). Local alerts need a development / production build.
 * See https://docs.expo.dev/develop/development-builds/introduction/
 */
export const notificationsAvailable = !(isRunningInExpoGo() && Platform.OS === 'android');

type NotificationsModule = typeof import('expo-notifications');

export type { NotificationsModule };

let Notifications: NotificationsModule | null = null;
let handlerReady = false;
const channelsReady = new Set<NotificationChannelId>();

export function getNotifications(): NotificationsModule | null {
  if (!notificationsAvailable) return null;
  if (!Notifications) {
    try {
      // Lazy require so Expo Go Android never evaluates the module (top-level throw).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Notifications = require('expo-notifications') as NotificationsModule;
    } catch {
      // Expo Go / unsupported runtime — treat as unavailable for this session.
      return null;
    }
  }
  return Notifications;
}

export function ensureNotificationHandler(mod: NotificationsModule): void {
  if (handlerReady) return;
  mod.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  handlerReady = true;
}

async function ensureAndroidChannel(
  mod: NotificationsModule,
  channelId: NotificationChannelId,
  name: string,
  importance: number,
): Promise<void> {
  if (Platform.OS !== 'android' || channelsReady.has(channelId)) return;
  await mod.setNotificationChannelAsync(channelId, {
    name,
    importance,
    vibrationPattern: [0, 250, 150, 250],
    sound: 'default',
  });
  channelsReady.add(channelId);
}

/** Ensure the Android channel used by this family exists. */
export async function ensureNotificationChannel(
  mod: NotificationsModule,
  channelId: NotificationChannelId,
): Promise<void> {
  if (channelId === NOTIFICATION_CHANNELS.restTimer) {
    await ensureAndroidChannel(mod, channelId, 'Rest timer', mod.AndroidImportance.HIGH);
    return;
  }
  if (channelId === NOTIFICATION_CHANNELS.workoutReminders) {
    await ensureAndroidChannel(mod, channelId, 'Workout reminders', mod.AndroidImportance.DEFAULT);
    return;
  }
  await ensureAndroidChannel(mod, channelId, 'Training digests', mod.AndroidImportance.DEFAULT);
}

export async function ensureNotificationPermission(mod: NotificationsModule): Promise<boolean> {
  const current = await mod.getPermissionsAsync();
  if (current.granted || current.ios?.status === mod.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const requested = await mod.requestPermissionsAsync();
  return requested.granted || requested.ios?.status === mod.IosAuthorizationStatus.PROVISIONAL;
}

/** Prepare module + permission + channel for scheduling. Returns null if unavailable. */
export async function prepareNotifications(
  channelId: NotificationChannelId,
): Promise<NotificationsModule | null> {
  const mod = getNotifications();
  if (!mod) return null;
  try {
    ensureNotificationHandler(mod);
    const ok = await ensureNotificationPermission(mod);
    if (!ok) return null;
    await ensureNotificationChannel(mod, channelId);
    const { ensureNotificationCategories } = await import('@/lib/notifications/actions');
    await ensureNotificationCategories(mod);
    return mod;
  } catch {
    return null;
  }
}

export async function cancelNotification(id: string): Promise<void> {
  const mod = getNotifications();
  if (!mod) return;
  try {
    await mod.cancelScheduledNotificationAsync(id);
  } catch {
    // ignore
  }
}
