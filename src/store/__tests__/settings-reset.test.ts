/**
 * Account-switch reset: the new account must never inherit the previous
 * owner's local-only prefs (reminders, nudges, media, behavior flags).
 * Only device taste survives (classic-accent memory, seen announcements).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => {
  let n = 0;
  return {
    randomUUID: () => `test-uuid-${++n}`,
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    digestStringAsync: async () => 'deadbeef',
  };
});

vi.mock('@/db/client', () => ({
  // Null-object DB: kv reads miss (fresh defaults), writes vanish.
  openDatabase: async () => ({
    getFirstAsync: async () => null,
    getAllAsync: async () => [],
    runAsync: async () => ({ lastInsertRowId: 0, changes: 0 }),
    execAsync: async () => {},
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
  }),
  isDatabaseReady: () => false,
  __resetDatabaseCacheForTests: () => {},
}));

import { resetAccountPreferences, useSettings } from '../settings-store';

beforeEach(() => {
  vi.useRealTimers();
});

describe('resetAccountPreferences', () => {
  it('resets local-only prefs to defaults but keeps device taste', () => {
    const s = useSettings.getState();
    s.setUnit('imperial');
    s.setHaptics(false);
    s.setKeepScreenAwake(false);
    s.setWorkoutRemindersEnabled(true);
    s.setWorkoutReminderDays([0]);
    s.setWorkoutReminderTime(7, 30);
    s.setWeeklyDigestEnabled(true);
    s.setMonthlyRecapEnabled(true);
    s.setAbandonedNudgeEnabled(true);
    s.setStreakNudgeEnabled(true);
    s.setMilestoneNudgeEnabled(true);
    s.markAbandonedNudged(42);
    s.markStreakNudged('2026-09-28');
    s.markAchievementsSeen(['first_session']);
    s.setExerciseMediaStyle('gif');
    s.dismissAnnouncement('welcome-v1');

    resetAccountPreferences();

    const after = useSettings.getState();
    expect(after.unit).toBe('metric');
    expect(after.hapticsEnabled).toBe(true);
    expect(after.keepScreenAwake).toBe(true);
    expect(after.workoutRemindersEnabled).toBe(false);
    expect(after.workoutReminderDays).toEqual([1, 3, 5]);
    expect(after.workoutReminderHour).toBe(18);
    expect(after.weeklyDigestEnabled).toBe(false);
    expect(after.monthlyRecapEnabled).toBe(false);
    expect(after.abandonedNudgeEnabled).toBe(false);
    expect(after.streakNudgeEnabled).toBe(false);
    expect(after.milestoneNudgeEnabled).toBe(false);
    expect(after.lastAbandonedNudgeLogId).toBe(null);
    expect(after.lastStreakNudgeWeekKey).toBe(null);
    expect(after.seenAchievementIds).toEqual([]);
    expect(after.exerciseMediaStyle).toBe('auto');
    // Device taste survives.
    expect(after.dismissedAnnouncementIds).toContain('welcome-v1');
  });
});
