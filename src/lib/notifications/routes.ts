import type { NotificationPayload } from '@/lib/notifications/types';

/** In-app path for a typed payload (local + future remote push). */
export function pathForNotificationPayload(payload: NotificationPayload): string | null {
  switch (payload.type) {
    case 'rest_complete':
      return payload.sessionId ? `/session/${payload.sessionId}` : '/(app)/(tabs)';
    case 'abandoned_session':
      return `/session/${payload.sessionId}`;
    case 'workout_reminder':
      return '/(app)/(tabs)';
    case 'weekly_digest':
      return '/(app)/report/week';
    case 'monthly_recap':
      return '/(app)/report/month';
    case 'streak_nudge':
      return '/(app)/(tabs)';
    case 'milestone':
      return '/(app)/(tabs)/progress';
    default:
      return null;
  }
}

/** Where a session-bound tap (rest, abandoned) should land; null = no such log. */
export type SessionLogState = { ended_at: number | null; deleted_at: number | null } | null;

/**
 * Settle a `/session/:id` target against the log as it is now (#152): a
 * finished log opens its summary, a discarded or missing one goes home, and
 * only an open log reopens the live session. Without this a rest alert tapped
 * after Finish landed on "Workout not found".
 */
export function pathForSessionLog(sessionId: number, log: SessionLogState): string {
  if (!log || log.deleted_at != null) return '/(app)/(tabs)';
  if (log.ended_at != null) return `/summary/${sessionId}`;
  return `/session/${sessionId}`;
}

/** The session a payload's route depends on, when its target is the live session. */
export function sessionIdForPayload(payload: NotificationPayload): number | null {
  if (payload.type === 'rest_complete' || payload.type === 'abandoned_session') {
    return payload.sessionId ?? null;
  }
  return null;
}
