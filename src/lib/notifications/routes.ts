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

/**
 * A session deep link is only good while that session is still open. A rest
 * alert tapped after Finish (or after a discard) used to land on "Workout
 * not found" (#152). Resolved when the route actually runs, after the
 * active-workout id has been restored, so a cold start sees the real state.
 */
export function resolveSessionPath(path: string, activeLogId: number | null): string {
  const m = /^\/session\/(\d+)$/.exec(path);
  if (!m) return path;
  return Number(m[1]) === activeLogId ? path : '/(app)/(tabs)';
}
