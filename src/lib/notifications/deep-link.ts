import { router, type Href } from 'expo-router';

import { pathForNotificationPayload, resolveSessionPath } from '@/lib/notifications/routes';
import { isNotificationPayload } from '@/lib/notifications/types';
import { useActiveWorkout } from '@/store/active-workout-store';

/** Route a notification payload now. Session links resolve against the open session (rest → live session, else Home). */
export function navigateFromNotificationData(data: unknown): void {
  if (!isNotificationPayload(data)) return;
  const path = pathForNotificationPayload(data);
  if (!path) return;
  try {
    router.push(resolveSessionPath(path, useActiveWorkout.getState().activeLogId) as Href);
  } catch {
    // Router may not be mounted yet; cold-start path retries via last response.
  }
}
