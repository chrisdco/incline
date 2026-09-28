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
