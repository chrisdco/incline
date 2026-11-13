import type { NotificationPayload } from '@/lib/notifications/types';

const HOME = '/(app)/(tabs)';

/**
 * "Whichever session is open right now." Rest alerts route here instead of
 * the id they were scheduled with: only one session is ever live, and the
 * tap should land on it even if the alert's id is stale or missing. Never
 * pushed as-is; `resolveSessionPath` turns it into a real route.
 */
export const LIVE_SESSION_PATH = '/session/live';

/** In-app path for a typed payload (local + future remote push). */
export function pathForNotificationPayload(payload: NotificationPayload): string | null {
  switch (payload.type) {
    case 'rest_complete':
      return LIVE_SESSION_PATH;
    case 'abandoned_session':
      return `/session/${payload.sessionId}`;
    case 'workout_reminder':
      return HOME;
    case 'weekly_digest':
      return '/(app)/report/week';
    case 'monthly_recap':
      return '/(app)/report/month';
    case 'streak_nudge':
      return HOME;
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
 * `LIVE_SESSION_PATH` becomes the open session, or Home when none is.
 */
export function resolveSessionPath(path: string, activeLogId: number | null): string {
  if (path === LIVE_SESSION_PATH) return activeLogId != null ? `/session/${activeLogId}` : HOME;
  const m = /^\/session\/(\d+)$/.exec(path);
  if (!m) return path;
  return Number(m[1]) === activeLogId ? path : HOME;
}
