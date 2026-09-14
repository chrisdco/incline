/**
 * Typed notification payloads.
 *
 * Local schedules and (later) remote Expo push should carry the same `type`
 * discriminator so deep-link handling stays one place.
 */
export type NotificationPayload =
  | { type: 'rest_complete'; sessionId?: number }
  | { type: 'workout_reminder' }
  | { type: 'weekly_digest'; weekStart?: string }
  | { type: 'monthly_recap'; monthKey?: string };

export const NOTIFICATION_CHANNELS = {
  restTimer: 'rest-timer',
  workoutReminders: 'workout-reminders',
  digests: 'digests',
} as const;

export type NotificationChannelId =
  (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

/** Stable local schedule IDs (cancel-family → reschedule). */
export const NOTIFICATION_IDS = {
  restComplete: 'incline-rest-complete',
  reminderDay: (jsWeekday: number) => `incline-reminder-${jsWeekday}`,
  weeklyDigest: 'incline-weekly-digest',
  monthlyRecap: 'incline-monthly-recap',
} as const;

/** JS `Date.getDay()` Sunday=0 … Saturday=6 → Expo WEEKLY weekday Sunday=1 … Saturday=7 */
export function jsWeekdayToExpo(jsWeekday: number): number {
  return jsWeekday + 1;
}

export function isNotificationPayload(value: unknown): value is NotificationPayload {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return (
    type === 'rest_complete' ||
    type === 'workout_reminder' ||
    type === 'weekly_digest' ||
    type === 'monthly_recap'
  );
}
