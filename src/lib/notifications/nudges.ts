import { Platform } from 'react-native';

import { cancelNotification, prepareNotifications } from '@/lib/notifications/core';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_IDS,
  type NotificationPayload,
} from '@/lib/notifications/types';

export {
  ABANDONED_IDLE_MS,
  STREAK_NUDGE_DAYS,
  mondayWeekKey,
  shouldNudgeAbandoned,
  shouldNudgeStreak,
  newlyUnlockedAchievementIds,
} from '@/lib/notifications/nudge-rules';

/**
 * Capped motivational nudges. Everything here is opt-in (Settings → Nudges)
 * and self-capping: one abandoned ping per session, one streak ping per
 * week, one ping per achievement. No streaks of nags, ever.
 */

async function scheduleOneShot(opts: {
  identifier: string;
  title: string;
  body: string;
  data: NotificationPayload;
}): Promise<boolean> {
  const mod = await prepareNotifications(NOTIFICATION_CHANNELS.digests);
  if (!mod) return false;
  try {
    await mod.scheduleNotificationAsync({
      identifier: opts.identifier,
      content: { title: opts.title, body: opts.body, sound: 'default', data: opts.data },
      trigger: {
        type: mod.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        repeats: false,
        ...(Platform.OS === 'android' ? { channelId: NOTIFICATION_CHANNELS.digests } : {}),
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelAbandonedNudge(): Promise<void> {
  await cancelNotification(NOTIFICATION_IDS.abandonedSession);
}

export async function cancelStreakNudge(): Promise<void> {
  await cancelNotification(NOTIFICATION_IDS.streakNudge);
}

export async function scheduleAbandonedNudge(sessionId: number, sessionName: string): Promise<boolean> {
  return scheduleOneShot({
    identifier: NOTIFICATION_IDS.abandonedSession,
    title: 'Still training?',
    body: `${sessionName} is still open — pick up where you left off.`,
    data: { type: 'abandoned_session', sessionId },
  });
}

export async function scheduleStreakNudge(streakWeeks: number, weekKey: string): Promise<boolean> {
  return scheduleOneShot({
    identifier: NOTIFICATION_IDS.streakNudge,
    title: 'Streak on the line',
    body: `${streakWeeks}-week streak ends Sunday — one session keeps it alive.`,
    data: { type: 'streak_nudge', weekKey },
  });
}

export async function scheduleMilestoneNudge(
  achievementId: string,
  title: string,
  description: string,
): Promise<boolean> {
  return scheduleOneShot({
    identifier: NOTIFICATION_IDS.milestone(achievementId),
    title: `Unlocked: ${title}`,
    body: description,
    data: { type: 'milestone', achievementId },
  });
}

export async function cancelMilestoneNudge(achievementId: string): Promise<void> {
  await cancelNotification(NOTIFICATION_IDS.milestone(achievementId));
}
