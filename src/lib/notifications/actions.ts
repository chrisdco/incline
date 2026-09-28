import type { NotificationsModule } from '@/lib/notifications/core';

/**
 * Action buttons on local notifications (no server, no new permissions).
 *
 * - Rest pings carry snooze (+1 min) and skip. Tapping the body still opens
 *   the live session; only explicit buttons take these paths.
 * - Workout reminders carry "View routines" so a tap-and-go start skips Home.
 */

export const NOTIFICATION_CATEGORIES = {
  rest: 'incline-rest',
  reminder: 'incline-reminder',
} as const;

export const NOTIFICATION_ACTIONS = {
  restSnooze: 'incline-action-rest-snooze',
  restSkip: 'incline-action-rest-skip',
  reminderRoutines: 'incline-action-reminder-routines',
} as const;

let categoriesReady = false;

/** Register action-button categories once per app launch (idempotent). */
export async function ensureNotificationCategories(mod: NotificationsModule): Promise<void> {
  if (categoriesReady) return;
  try {
    await mod.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.rest, [
      { identifier: NOTIFICATION_ACTIONS.restSnooze, buttonTitle: '+1 min', options: { opensAppToForeground: false } },
      { identifier: NOTIFICATION_ACTIONS.restSkip, buttonTitle: 'Skip', options: { opensAppToForeground: false } },
    ]);
    await mod.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.reminder, [
      { identifier: NOTIFICATION_ACTIONS.reminderRoutines, buttonTitle: 'View routines', options: { opensAppToForeground: true } },
    ]);
    categoriesReady = true;
  } catch {
    // Unsupported runtime — notifications degrade to button-less.
  }
}

export type NotificationAction =
  | { kind: 'snooze_rest'; seconds: 60; sessionId?: number }
  | { kind: 'skip_rest' }
  | { kind: 'open_routines' };

/**
 * Map an action-button tap to an app action. Returns null for body taps
 * (which fall through to normal payload deep-linking).
 */
export function actionForResponse(
  actionIdentifier: string | undefined,
  data: unknown,
): NotificationAction | null {
  if (!actionIdentifier || actionIdentifier === 'expo.modules.notifications.actions.DEFAULT') return null;
  if (actionIdentifier === NOTIFICATION_ACTIONS.restSnooze) {
    const sessionId =
      data && typeof data === 'object' && 'sessionId' in data && typeof (data as { sessionId?: unknown }).sessionId === 'number'
        ? (data as { sessionId: number }).sessionId
        : undefined;
    return { kind: 'snooze_rest', seconds: 60, sessionId };
  }
  if (actionIdentifier === NOTIFICATION_ACTIONS.restSkip) return { kind: 'skip_rest' };
  if (actionIdentifier === NOTIFICATION_ACTIONS.reminderRoutines) return { kind: 'open_routines' };
  return null;
}

/** Deep-link target for actions that open the app (null = stay/dismiss). */
export function pathForNotificationAction(action: NotificationAction): string | null {
  if (action.kind === 'open_routines') return '/(app)/(tabs)/workouts';
  return null;
}
