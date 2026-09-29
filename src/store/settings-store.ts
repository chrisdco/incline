import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/constants/config';
import { kvStorage } from '@/db/kv';
import type { Settings, Unit, ThemeMode, AccentTheme, CalendarHeatMetric, WeekStartsOn, BodyMetric, ExerciseMediaStyle, ExerciseMediaAnimation, DevExerciseMediaOverride } from '@/db/types';
import { isCalendarHeatMetric, isWeekStartsOn, DEFAULT_ENABLED_BODY_METRICS } from '@/db/types';
import { DEFAULT_ACCENT_THEME, isAccentTheme, isAuroraAccent } from '@/lib/accent-themes';
import { sanitizeEnabledBodyMetrics } from '@/lib/body-metrics';
import {
  ACCOUNT_PREF_DEFAULTS,
  ACCOUNT_PREFS_ROW,
  ACCOUNT_PREFS_UPDATED_AT_KEY,
  accountPrefsChanged,
  pickAccountPrefs,
} from '@/sync/account-prefs';
import { enqueueSync } from '@/sync/outbox';

interface SettingsState extends Settings {
  /** Last Classic accent — restored when leaving an aurora preset. Device-local. */
  lastClassicAccent: AccentTheme;
  /** Nudge caps (device-local, never synced): one ping per session / week. */
  lastAbandonedNudgeLogId: number | null;
  lastStreakNudgeWeekKey: string | null;
  seenAchievementIds: string[];
  setUnit: (unit: Unit) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentTheme: (accent: AccentTheme) => void;
  /** Full-skin presets: aurora ids enable the neon skin, anything else is Classic. */
  applyThemePreset: (preset: 'classic' | AccentTheme) => void;
  setHaptics: (enabled: boolean) => void;
  setRestSound: (enabled: boolean) => void;
  setAutoStartRest: (enabled: boolean) => void;
  setDefaultRestSeconds: (seconds: number) => void;
  setShowWarmUpSets: (enabled: boolean) => void;
  setShowRpe: (enabled: boolean) => void;
  setAiExplanationsEnabled: (enabled: boolean) => void;
  setCalendarHeatMetric: (metric: CalendarHeatMetric) => void;
  setWeekStartsOn: (day: WeekStartsOn) => void;
  setKeepScreenAwake: (enabled: boolean) => void;
  setWorkoutRemindersEnabled: (enabled: boolean) => void;
  setWorkoutReminderDays: (days: number[]) => void;
  setWorkoutReminderTime: (hour: number, minute: number) => void;
  setWeeklyDigestEnabled: (enabled: boolean) => void;
  setWeeklyDigestTime: (hour: number, minute: number) => void;
  setMonthlyRecapEnabled: (enabled: boolean) => void;
  setAbandonedNudgeEnabled: (enabled: boolean) => void;
  setStreakNudgeEnabled: (enabled: boolean) => void;
  setMilestoneNudgeEnabled: (enabled: boolean) => void;
  markAbandonedNudged: (logId: number) => void;
  markStreakNudged: (weekKey: string) => void;
  markAchievementsSeen: (ids: string[]) => void;
  setEnabledBodyMetrics: (metrics: BodyMetric[]) => void;
  toggleBodyMetric: (metric: BodyMetric) => void;
  setWeeklyWorkoutGoal: (goal: number) => void;
  dismissAnnouncement: (id: string) => void;
  setShowSessionGhost: (enabled: boolean) => void;
  setExerciseMediaStyle: (style: ExerciseMediaStyle) => void;
  setExerciseMediaAnimation: (animation: ExerciseMediaAnimation) => void;
  setDevExerciseMediaOverride: (override: DevExerciseMediaOverride) => void;
}

const EXERCISE_MEDIA_STYLES: readonly ExerciseMediaStyle[] = ['auto', 'gif', 'illustration'];
const EXERCISE_MEDIA_ANIMATIONS: readonly ExerciseMediaAnimation[] = ['cycle', 'static'];
const DEV_MEDIA_OVERRIDES: readonly DevExerciseMediaOverride[] = ['off', 'auto', 'gif', 'illustration'];

export function isExerciseMediaStyle(v: unknown): v is ExerciseMediaStyle {
  return typeof v === 'string' && (EXERCISE_MEDIA_STYLES as readonly string[]).includes(v);
}

export function isExerciseMediaAnimation(v: unknown): v is ExerciseMediaAnimation {
  return typeof v === 'string' && (EXERCISE_MEDIA_ANIMATIONS as readonly string[]).includes(v);
}

export function isDevExerciseMediaOverride(v: unknown): v is DevExerciseMediaOverride {
  return typeof v === 'string' && (DEV_MEDIA_OVERRIDES as readonly string[]).includes(v);
}

const DEFAULT_REST_OPTIONS = [30, 60, 90, 120] as const;

/** Default reminder days: Mon / Wed / Fri (JS weekdays). */
export const DEFAULT_WORKOUT_REMINDER_DAYS = [1, 3, 5] as const;

export const WORKOUT_REMINDER_TIME_PRESETS: { label: string; hour: number; minute: number }[] = [
  { label: '6:00', hour: 6, minute: 0 },
  { label: '7:00', hour: 7, minute: 0 },
  { label: '12:00', hour: 12, minute: 0 },
  { label: '17:00', hour: 17, minute: 0 },
  { label: '18:00', hour: 18, minute: 0 },
  { label: '19:00', hour: 19, minute: 0 },
  { label: '20:00', hour: 20, minute: 0 },
];

function sanitizeReminderDays(days: unknown): number[] {
  if (!Array.isArray(days)) return [...DEFAULT_WORKOUT_REMINDER_DAYS];
  const cleaned = [
    ...new Set(
      days
        .map((d) => (typeof d === 'number' ? d : Number(d)))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    ),
  ].sort((a, b) => a - b);
  return cleaned.length > 0 ? cleaned : [...DEFAULT_WORKOUT_REMINDER_DAYS];
}

function sanitizeHour(hour: unknown, fallback = 18): number {
  if (typeof hour !== 'number' || !Number.isFinite(hour)) return fallback;
  return Math.min(23, Math.max(0, Math.round(hour)));
}

function sanitizeMinute(minute: unknown, fallback = 0): number {
  if (typeof minute !== 'number' || !Number.isFinite(minute)) return fallback;
  return Math.min(59, Math.max(0, Math.round(minute)));
}

function sanitizeWeeklyGoal(goal: unknown): number {
  if (typeof goal !== 'number' || !Number.isFinite(goal)) return 4;
  const g = Math.round(goal);
  if (g <= 0) return 0;
  return Math.min(7, Math.max(1, g));
}

function sanitizeDismissedIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}

/**
 * Minimal global settings store. The only genuinely cross-screen, persisted
 * global state in the app. Persisted to the SQLite kv table (no AsyncStorage).
 */
let suppressPrefSync = false;

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      unit: 'metric',
      themeMode: 'system',
      accentTheme: DEFAULT_ACCENT_THEME,
      // Last Classic accent — restored when leaving an aurora preset.
      // Device-local (not synced): a restore helper, not a preference.
      lastClassicAccent: DEFAULT_ACCENT_THEME,
      hapticsEnabled: true,
      restSoundEnabled: true,
      autoStartRest: true,
      defaultRestSeconds: 90,
      showWarmUpSets: true,
      showRpe: true,
      aiExplanationsEnabled: false,
      calendarHeatMetric: 'volume',
      weekStartsOn: 'monday',
      keepScreenAwake: true,
      workoutRemindersEnabled: false,
      workoutReminderDays: [...DEFAULT_WORKOUT_REMINDER_DAYS],
      workoutReminderHour: 18,
      workoutReminderMinute: 0,
      weeklyDigestEnabled: false,
      weeklyDigestHour: 18,
      weeklyDigestMinute: 0,
      monthlyRecapEnabled: false,
      abandonedNudgeEnabled: false,
      streakNudgeEnabled: false,
      milestoneNudgeEnabled: false,
      // Nudge caps live next to the toggles: device-local helpers, not prefs.
      lastAbandonedNudgeLogId: null,
      lastStreakNudgeWeekKey: null,
      seenAchievementIds: [],
      enabledBodyMetrics: [...DEFAULT_ENABLED_BODY_METRICS],
      weeklyWorkoutGoal: 4,
      dismissedAnnouncementIds: [],
      showSessionGhost: true,
      exerciseMediaStyle: 'auto',
      exerciseMediaAnimation: 'cycle',
      devExerciseMediaOverride: 'off',
      setUnit: (unit) => set({ unit }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setAccentTheme: (accentTheme) =>
        set((s) => ({
          accentTheme,
          // Classic dots double as "back to Classic": remember the choice so
          // Theme → Classic restores it instead of a hardcoded default.
          ...(isAuroraAccent(accentTheme) ? null : { lastClassicAccent: accentTheme }),
        })),
      applyThemePreset: (preset) =>
        set((s) => {
          if (preset === 'classic') return { accentTheme: s.lastClassicAccent };
          return {
            ...(isAuroraAccent(s.accentTheme) ? null : { lastClassicAccent: s.accentTheme }),
            accentTheme: preset,
          };
        }),
      setHaptics: (enabled) => set({ hapticsEnabled: enabled }),
      setRestSound: (enabled) => set({ restSoundEnabled: enabled }),
      setAutoStartRest: (enabled) => set({ autoStartRest: enabled }),
      setDefaultRestSeconds: (seconds) => set({ defaultRestSeconds: seconds }),
      setShowWarmUpSets: (enabled) => set({ showWarmUpSets: enabled }),
      setShowRpe: (enabled) => set({ showRpe: enabled }),
      setAiExplanationsEnabled: (enabled) => set({ aiExplanationsEnabled: enabled }),
      setCalendarHeatMetric: (calendarHeatMetric) => set({ calendarHeatMetric }),
      setWeekStartsOn: (weekStartsOn) => set({ weekStartsOn }),
      setKeepScreenAwake: (keepScreenAwake) => set({ keepScreenAwake }),
      setWorkoutRemindersEnabled: (workoutRemindersEnabled) => set({ workoutRemindersEnabled }),
      setWorkoutReminderDays: (days) => set({ workoutReminderDays: sanitizeReminderDays(days) }),
      setWorkoutReminderTime: (hour, minute) =>
        set({
          workoutReminderHour: sanitizeHour(hour),
          workoutReminderMinute: sanitizeMinute(minute),
        }),
      setWeeklyDigestEnabled: (weeklyDigestEnabled) => set({ weeklyDigestEnabled }),
      setWeeklyDigestTime: (hour, minute) =>
        set({
          weeklyDigestHour: sanitizeHour(hour, 18),
          weeklyDigestMinute: sanitizeMinute(minute, 0),
        }),
      setMonthlyRecapEnabled: (monthlyRecapEnabled) => set({ monthlyRecapEnabled }),
      setAbandonedNudgeEnabled: (abandonedNudgeEnabled) => set({ abandonedNudgeEnabled }),
      setStreakNudgeEnabled: (streakNudgeEnabled) => set({ streakNudgeEnabled }),
      setMilestoneNudgeEnabled: (milestoneNudgeEnabled) => set({ milestoneNudgeEnabled }),
      markAbandonedNudged: (logId: number) => set({ lastAbandonedNudgeLogId: logId }),
      markStreakNudged: (weekKey: string) => set({ lastStreakNudgeWeekKey: weekKey }),
      markAchievementsSeen: (ids: string[]) =>
        set((s) => ({
          seenAchievementIds: [...new Set([...s.seenAchievementIds, ...ids.filter((id) => id.length > 0)])],
        })),
      setEnabledBodyMetrics: (metrics) =>
        set({ enabledBodyMetrics: sanitizeEnabledBodyMetrics(metrics) }),
      toggleBodyMetric: (metric) =>
        set((s) => {
          if (metric === 'bodyweight') return s;
          const has = s.enabledBodyMetrics.includes(metric);
          const next = has
            ? s.enabledBodyMetrics.filter((m) => m !== metric)
            : [...s.enabledBodyMetrics, metric];
          return { enabledBodyMetrics: sanitizeEnabledBodyMetrics(next) };
        }),
      setWeeklyWorkoutGoal: (weeklyWorkoutGoal) =>
        set({ weeklyWorkoutGoal: sanitizeWeeklyGoal(weeklyWorkoutGoal) }),
      dismissAnnouncement: (id) =>
        set((s) => ({
          dismissedAnnouncementIds: sanitizeDismissedIds([...s.dismissedAnnouncementIds, id]),
        })),
      setShowSessionGhost: (showSessionGhost) => set({ showSessionGhost }),
      setExerciseMediaStyle: (exerciseMediaStyle) => set({ exerciseMediaStyle }),
      setExerciseMediaAnimation: (exerciseMediaAnimation) => set({ exerciseMediaAnimation }),
      setDevExerciseMediaOverride: (devExerciseMediaOverride) => set({ devExerciseMediaOverride }),
    }),
    {
      name: STORAGE_KEYS.settings,
      storage: createJSONStorage(() => kvStorage),
      partialize: (s) => ({
        unit: s.unit,
        themeMode: s.themeMode,
        accentTheme: s.accentTheme,
        lastClassicAccent: s.lastClassicAccent,
        hapticsEnabled: s.hapticsEnabled,
        restSoundEnabled: s.restSoundEnabled,
        autoStartRest: s.autoStartRest,
        defaultRestSeconds: s.defaultRestSeconds,
        showWarmUpSets: s.showWarmUpSets,
        showRpe: s.showRpe,
        aiExplanationsEnabled: s.aiExplanationsEnabled,
        calendarHeatMetric: s.calendarHeatMetric,
        weekStartsOn: s.weekStartsOn,
        keepScreenAwake: s.keepScreenAwake,
        workoutRemindersEnabled: s.workoutRemindersEnabled,
        workoutReminderDays: s.workoutReminderDays,
        workoutReminderHour: s.workoutReminderHour,
        workoutReminderMinute: s.workoutReminderMinute,
        weeklyDigestEnabled: s.weeklyDigestEnabled,
        weeklyDigestHour: s.weeklyDigestHour,
        weeklyDigestMinute: s.weeklyDigestMinute,
        monthlyRecapEnabled: s.monthlyRecapEnabled,
        abandonedNudgeEnabled: s.abandonedNudgeEnabled,
        streakNudgeEnabled: s.streakNudgeEnabled,
        milestoneNudgeEnabled: s.milestoneNudgeEnabled,
        lastAbandonedNudgeLogId: s.lastAbandonedNudgeLogId,
        lastStreakNudgeWeekKey: s.lastStreakNudgeWeekKey,
        seenAchievementIds: s.seenAchievementIds,
        enabledBodyMetrics: s.enabledBodyMetrics,
        weeklyWorkoutGoal: s.weeklyWorkoutGoal,
        dismissedAnnouncementIds: s.dismissedAnnouncementIds,
        showSessionGhost: s.showSessionGhost,
        exerciseMediaStyle: s.exerciseMediaStyle,
        exerciseMediaAnimation: s.exerciseMediaAnimation,
        devExerciseMediaOverride: s.devExerciseMediaOverride,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Settings> & {
          lastClassicAccent?: unknown;
          lastAbandonedNudgeLogId?: unknown;
          lastStreakNudgeWeekKey?: unknown;
          seenAchievementIds?: unknown;
        };
        return {
          ...current,
          ...p,
          accentTheme: isAccentTheme(p.accentTheme) ? p.accentTheme : DEFAULT_ACCENT_THEME,
          lastClassicAccent:
            p.lastClassicAccent != null && isAccentTheme(p.lastClassicAccent) && !isAuroraAccent(p.lastClassicAccent)
              ? p.lastClassicAccent
              : DEFAULT_ACCENT_THEME,
          calendarHeatMetric: isCalendarHeatMetric(p.calendarHeatMetric)
            ? p.calendarHeatMetric
            : 'volume',
          weekStartsOn: isWeekStartsOn(p.weekStartsOn) ? p.weekStartsOn : 'monday',
          keepScreenAwake: typeof p.keepScreenAwake === 'boolean' ? p.keepScreenAwake : true,
          showRpe: typeof p.showRpe === 'boolean' ? p.showRpe : true,
          aiExplanationsEnabled:
            typeof p.aiExplanationsEnabled === 'boolean' ? p.aiExplanationsEnabled : false,
          workoutRemindersEnabled:
            typeof p.workoutRemindersEnabled === 'boolean' ? p.workoutRemindersEnabled : false,
          workoutReminderDays: sanitizeReminderDays(p.workoutReminderDays),
          workoutReminderHour: sanitizeHour(p.workoutReminderHour, 18),
          workoutReminderMinute: sanitizeMinute(p.workoutReminderMinute, 0),
          weeklyDigestEnabled:
            typeof p.weeklyDigestEnabled === 'boolean' ? p.weeklyDigestEnabled : false,
          weeklyDigestHour: sanitizeHour(p.weeklyDigestHour, 18),
          weeklyDigestMinute: sanitizeMinute(p.weeklyDigestMinute, 0),
          monthlyRecapEnabled:
            typeof p.monthlyRecapEnabled === 'boolean' ? p.monthlyRecapEnabled : false,
          abandonedNudgeEnabled:
            typeof p.abandonedNudgeEnabled === 'boolean' ? p.abandonedNudgeEnabled : false,
          streakNudgeEnabled:
            typeof p.streakNudgeEnabled === 'boolean' ? p.streakNudgeEnabled : false,
          milestoneNudgeEnabled:
            typeof p.milestoneNudgeEnabled === 'boolean' ? p.milestoneNudgeEnabled : false,
          lastAbandonedNudgeLogId:
            typeof p.lastAbandonedNudgeLogId === 'number' ? p.lastAbandonedNudgeLogId : null,
          lastStreakNudgeWeekKey:
            typeof p.lastStreakNudgeWeekKey === 'string' ? p.lastStreakNudgeWeekKey : null,
          seenAchievementIds: sanitizeDismissedIds(p.seenAchievementIds),
          enabledBodyMetrics: sanitizeEnabledBodyMetrics(p.enabledBodyMetrics),
          weeklyWorkoutGoal: sanitizeWeeklyGoal(p.weeklyWorkoutGoal),
          dismissedAnnouncementIds: sanitizeDismissedIds(p.dismissedAnnouncementIds),
          showSessionGhost: typeof p.showSessionGhost === 'boolean' ? p.showSessionGhost : true,
          exerciseMediaStyle: isExerciseMediaStyle(p.exerciseMediaStyle) ? p.exerciseMediaStyle : 'auto',
          exerciseMediaAnimation: isExerciseMediaAnimation(p.exerciseMediaAnimation)
            ? p.exerciseMediaAnimation
            : 'cycle',
          devExerciseMediaOverride: isDevExerciseMediaOverride(p.devExerciseMediaOverride)
            ? p.devExerciseMediaOverride
            : 'off',
        };
      },
      onRehydrateStorage: () => {
        suppressPrefSync = true;
        return () => {
          suppressPrefSync = false;
        };
      },
    },
  ),
);

useSettings.subscribe((state, prev) => {
  if (suppressPrefSync) return;
  if (!accountPrefsChanged(state as unknown as Record<string, unknown>, prev as unknown as Record<string, unknown>)) {
    return;
  }
  const updatedAt = Date.now();
  void (async () => {
    await kvStorage.setItem(ACCOUNT_PREFS_UPDATED_AT_KEY, String(updatedAt));
    await enqueueSync(
      'user_preferences',
      ACCOUNT_PREFS_ROW,
      'upsert',
      {
        ...pickAccountPrefs(state as unknown as Record<string, unknown>),
        updated_at: updatedAt,
        deleted_at: null,
      },
    );
  })().catch(() => {});
});

/**
 * Reset account-scoped prefs on account switch. Synced keys go to cloud
 * defaults; local-only keys (reminders, nudges, media, behavior flags) go
 * to app defaults so the new account never inherits the old owner's setup.
 * Only device taste survives: classic-accent memory + seen announcements.
 */
export function resetAccountPreferences(): void {
  suppressPrefSync = true;
  try {
    useSettings.setState({
      themeMode: ACCOUNT_PREF_DEFAULTS.themeMode as Settings['themeMode'],
      accentTheme: isAccentTheme(ACCOUNT_PREF_DEFAULTS.accentTheme)
        ? ACCOUNT_PREF_DEFAULTS.accentTheme
        : DEFAULT_ACCENT_THEME,
      calendarHeatMetric: 'volume',
      weekStartsOn: 'monday',
      weeklyWorkoutGoal: ACCOUNT_PREF_DEFAULTS.weeklyWorkoutGoal,
      enabledBodyMetrics: sanitizeEnabledBodyMetrics(ACCOUNT_PREF_DEFAULTS.enabledBodyMetrics),
      showWarmUpSets: ACCOUNT_PREF_DEFAULTS.showWarmUpSets,
      showRpe: ACCOUNT_PREF_DEFAULTS.showRpe,
      autoStartRest: ACCOUNT_PREF_DEFAULTS.autoStartRest,
      defaultRestSeconds: ACCOUNT_PREF_DEFAULTS.defaultRestSeconds,
      showSessionGhost: ACCOUNT_PREF_DEFAULTS.showSessionGhost,
      // Local-only prefs never sync, so a new account would otherwise inherit
      // the previous owner's reminders, nudges, media taste, and behavior
      // flags. Reset them; only device taste (classic-accent memory, seen
      // announcements) survives the switch.
      unit: 'metric',
      hapticsEnabled: true,
      restSoundEnabled: true,
      keepScreenAwake: true,
      workoutRemindersEnabled: false,
      workoutReminderDays: [...DEFAULT_WORKOUT_REMINDER_DAYS],
      workoutReminderHour: 18,
      workoutReminderMinute: 0,
      weeklyDigestEnabled: false,
      weeklyDigestHour: 18,
      weeklyDigestMinute: 0,
      monthlyRecapEnabled: false,
      abandonedNudgeEnabled: false,
      streakNudgeEnabled: false,
      milestoneNudgeEnabled: false,
      lastAbandonedNudgeLogId: null,
      lastStreakNudgeWeekKey: null,
      seenAchievementIds: [],
      exerciseMediaStyle: 'auto',
      exerciseMediaAnimation: 'cycle',
      devExerciseMediaOverride: 'off',
    });
  } finally {
    suppressPrefSync = false;
  }
  void kvStorage.removeItem(ACCOUNT_PREFS_UPDATED_AT_KEY);
}

export function applyRemoteAccountPrefs(payload: Record<string, unknown>): void {
  const prefs = pickAccountPrefs(payload);
  const remoteAccent = isAccentTheme(prefs.accentTheme) ? prefs.accentTheme : DEFAULT_ACCENT_THEME;
  suppressPrefSync = true;
  try {
    useSettings.setState((s) => ({
      themeMode: prefs.themeMode === 'light' || prefs.themeMode === 'dark' || prefs.themeMode === 'system'
        ? prefs.themeMode
        : 'system',
      accentTheme: remoteAccent,
      // A Classic accent arriving from another device becomes the restore point.
      lastClassicAccent: isAuroraAccent(remoteAccent) ? s.lastClassicAccent : remoteAccent,
      calendarHeatMetric: isCalendarHeatMetric(prefs.calendarHeatMetric)
        ? prefs.calendarHeatMetric
        : 'volume',
      weekStartsOn: isWeekStartsOn(prefs.weekStartsOn) ? prefs.weekStartsOn : 'monday',
      weeklyWorkoutGoal: prefs.weeklyWorkoutGoal,
      enabledBodyMetrics: sanitizeEnabledBodyMetrics(prefs.enabledBodyMetrics),
      showWarmUpSets: prefs.showWarmUpSets,
      showRpe: prefs.showRpe,
      autoStartRest: prefs.autoStartRest,
      defaultRestSeconds: prefs.defaultRestSeconds,
      showSessionGhost: prefs.showSessionGhost,
    }));
  } finally {
    suppressPrefSync = false;
  }
}

export { DEFAULT_REST_OPTIONS };
