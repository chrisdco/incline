import { describe, expect, it } from 'vitest';

import {
  NOTIFICATION_ACTIONS,
  actionForResponse,
  pathForNotificationAction,
} from '@/lib/notifications/actions';
import {
  mondayWeekKey,
  newlyUnlockedAchievementIds,
  shouldNudgeAbandoned,
  shouldNudgeStreak,
} from '@/lib/notifications/nudge-rules';
import { reminderBodyForDay } from '@/lib/notifications/copy';
import { pathForNotificationPayload } from '@/lib/notifications/routes';
import {
  NOTIFICATION_IDS,
  isNotificationPayload,
  jsWeekdayToExpo,
} from '@/lib/notifications/types';

describe('jsWeekdayToExpo', () => {
  it('maps JS Sunday=0 to Expo Sunday=1 … Saturday=7', () => {
    expect(jsWeekdayToExpo(0)).toBe(1);
    expect(jsWeekdayToExpo(1)).toBe(2);
    expect(jsWeekdayToExpo(6)).toBe(7);
  });
});

describe('isNotificationPayload', () => {
  it('accepts known types', () => {
    expect(isNotificationPayload({ type: 'workout_reminder' })).toBe(true);
    expect(isNotificationPayload({ type: 'rest_complete' })).toBe(true);
    expect(isNotificationPayload({ type: 'weekly_digest', weekStart: '2026-08-03' })).toBe(true);
    expect(isNotificationPayload({ type: 'monthly_recap' })).toBe(true);
    expect(isNotificationPayload({ type: 'abandoned_session', sessionId: 7 })).toBe(true);
    expect(isNotificationPayload({ type: 'streak_nudge', weekKey: '2026-09-28' })).toBe(true);
    expect(isNotificationPayload({ type: 'milestone', achievementId: 'sessions_10' })).toBe(true);
  });

  it('rejects unknown shapes', () => {
    expect(isNotificationPayload(null)).toBe(false);
    expect(isNotificationPayload({})).toBe(false);
    expect(isNotificationPayload({ type: 'promo' })).toBe(false);
  });
});

describe('NOTIFICATION_IDS', () => {
  it('uses stable reminder identifiers per weekday', () => {
    expect(NOTIFICATION_IDS.reminderDay(1)).toBe('incline-reminder-1');
    expect(NOTIFICATION_IDS.restComplete).toBe('incline-rest-complete');
  });
});

describe('pathForNotificationPayload', () => {
  it('routes reminder and digests to the right screens', () => {
    expect(pathForNotificationPayload({ type: 'workout_reminder' })).toBe('/(app)/(tabs)');
    expect(pathForNotificationPayload({ type: 'weekly_digest' })).toBe('/(app)/report/week');
    expect(pathForNotificationPayload({ type: 'monthly_recap' })).toBe('/(app)/report/month');
    expect(pathForNotificationPayload({ type: 'rest_complete' })).toBe('/(app)/(tabs)');
  });

  it('routes nudges to the session, home, and progress', () => {
    expect(pathForNotificationPayload({ type: 'abandoned_session', sessionId: 7 })).toBe('/session/7');
    expect(pathForNotificationPayload({ type: 'streak_nudge', weekKey: '2026-09-28' })).toBe('/(app)/(tabs)');
    expect(pathForNotificationPayload({ type: 'milestone', achievementId: 'sessions_10' })).toBe(
      '/(app)/(tabs)/progress',
    );
  });

  it('routes rest with a session id to the live session', () => {
    expect(pathForNotificationPayload({ type: 'rest_complete', sessionId: 3 })).toBe('/session/3');
  });
});

describe('actionForResponse', () => {
  it('returns null for body taps and unknown actions', () => {
    expect(actionForResponse(undefined, { type: 'rest_complete' })).toBe(null);
    expect(
      actionForResponse('expo.modules.notifications.actions.DEFAULT', { type: 'rest_complete' }),
    ).toBe(null);
    expect(actionForResponse('nope', { type: 'rest_complete' })).toBe(null);
  });

  it('maps rest snooze with the session id through', () => {
    expect(
      actionForResponse(NOTIFICATION_ACTIONS.restSnooze, { type: 'rest_complete', sessionId: 9 }),
    ).toEqual({ kind: 'snooze_rest', seconds: 60, sessionId: 9 });
  });

  it('maps skip and view-routines', () => {
    expect(actionForResponse(NOTIFICATION_ACTIONS.restSkip, { type: 'rest_complete' })).toEqual({
      kind: 'skip_rest',
    });
    expect(
      actionForResponse(NOTIFICATION_ACTIONS.reminderRoutines, { type: 'workout_reminder' }),
    ).toEqual({ kind: 'open_routines' });
    expect(pathForNotificationAction({ kind: 'open_routines' })).toBe('/(app)/(tabs)/workouts');
    expect(pathForNotificationAction({ kind: 'skip_rest' })).toBe(null);
  });
});

describe('reminderBodyForDay', () => {
  it('names the training day instead of the generic line', () => {
    expect(reminderBodyForDay(2)).toBe('Tuesday session — ready when you are.');
    expect(reminderBodyForDay(0)).toBe('Sunday session — ready when you are.');
    expect(reminderBodyForDay(99)).toBe('Workout session — ready when you are.');
  });
});

describe('nudge caps', () => {
  it('abandoned fires once per session after 25 idle minutes', () => {
    const now = 1_000_000_000;
    const idle = now - 26 * 60 * 1000;
    expect(shouldNudgeAbandoned(now, idle, null, 5)).toBe(true);
    expect(shouldNudgeAbandoned(now, now - 5 * 60 * 1000, null, 5)).toBe(false);
    expect(shouldNudgeAbandoned(now, idle, 5, 5)).toBe(false);
    expect(shouldNudgeAbandoned(now, idle, 4, 5)).toBe(true);
  });

  it('streak fires once per week, Thu–Sun only, with sessions blocking', () => {
    // Thursday 2026-10-01 19:00 local
    const thu = new Date(2026, 9, 1, 19, 0, 0).getTime();
    expect(new Date(thu).getDay()).toBe(4);
    expect(shouldNudgeStreak(thu, 3, 0, null)).toBe(true);
    expect(shouldNudgeStreak(thu, 3, 1, null)).toBe(false);
    expect(shouldNudgeStreak(thu, 0, 0, null)).toBe(false);
    expect(shouldNudgeStreak(thu, 3, 0, mondayWeekKey(thu))).toBe(false);
    // Wednesday stays quiet even with a live streak and an empty week
    expect(shouldNudgeStreak(new Date(2026, 8, 30, 19).getTime(), 3, 0, null)).toBe(false);
  });

  it('mondayWeekKey is stable within a week', () => {
    const mon = new Date(2026, 8, 28, 8).getTime();
    const sun = new Date(2026, 9, 4, 23).getTime();
    expect(mondayWeekKey(mon)).toBe(mondayWeekKey(sun));
    expect(mondayWeekKey(mon)).toBe('2026-09-28');
  });

  it('milestones report only newly unlocked ids', () => {
    const statuses = [
      { id: 'first_session', unlocked: true },
      { id: 'sessions_10', unlocked: true },
      { id: 'sessions_50', unlocked: false },
    ];
    expect(newlyUnlockedAchievementIds(['first_session'], statuses)).toEqual(['sessions_10']);
    expect(newlyUnlockedAchievementIds(['first_session', 'sessions_10'], statuses)).toEqual([]);
  });
});
