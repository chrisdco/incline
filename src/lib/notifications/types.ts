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
  | { type: 'monthly_recap'; monthKey?: string }
  | { type: 'abandoned_session'; sessionId: number }
  | { type: 'streak_nudge'; weekKey: string }
  | { type: 'milestone'; achievementId: string };

export const NOTIFICATION_CHANNELS = {
  /**
   * Bump the suffix when channel settings change: Android channels are
   * immutable after first creation, and the channel ID is what appears in
   * system settings. `core.ts` deletes the legacy `rest-timer` channel.
   */
  restTimer: 'rest-timer-v2',
  workoutReminders: 'workout-reminders',
  digests: 'digests',
} as const;

/** Channel shipped before #251 settings (PUBLIC lock screen, no badge). */
export const LEGACY_REST_TIMER_CHANNEL = 'rest-timer';

export type NotificationChannelId =
  (typeof NOTIFICATION_CHANNELS)[keyof typeof NOTIFICATION_CHANNELS];

/** Stable local schedule IDs (cancel-family → reschedule). */
export const NOTIFICATION_IDS = {
  restComplete: 'incline-rest-complete',
  reminderDay: (jsWeekday: number) => `incline-reminder-${jsWeekday}`,
  weeklyDigest: 'incline-weekly-digest',
  monthlyRecap: 'incline-monthly-recap',
  abandonedSession: 'incline-abandoned-session',
  streakNudge: 'incline-streak-nudge',
  milestone: (achievementId: string) => `incline-milestone-${achievementId}`,
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
    type === 'monthly_recap' ||
    type === 'abandoned_session' ||
    type === 'streak_nudge' ||
    type === 'milestone'
  );
}
