/** Cross-device account preferences. Unit lives on profile; AI opt-in stays per-device. */
export const ACCOUNT_PREF_KEYS = [
  'themeMode',
  'accentTheme',
  'calendarHeatMetric',
  'weekStartsOn',
  'weeklyWorkoutGoal',
  'enabledBodyMetrics',
  'showWarmUpSets',
  'showRpe',
  'autoStartRest',
  'defaultRestSeconds',
  'showSessionGhost',
] as const;

export const ACCOUNT_PREFS_ROW = 'prefs';
export const ACCOUNT_PREFS_UPDATED_AT_KEY = 'account_prefs_updated_at';

export type AccountPrefKey = (typeof ACCOUNT_PREF_KEYS)[number];

export type AccountPrefsPayload = {
  themeMode: string;
  accentTheme: string;
  calendarHeatMetric: string;
  weekStartsOn: string;
  weeklyWorkoutGoal: number;
  enabledBodyMetrics: string[];
  showWarmUpSets: boolean;
  showRpe: boolean;
  autoStartRest: boolean;
  defaultRestSeconds: number;
  showSessionGhost: boolean;
};

export const ACCOUNT_PREF_DEFAULTS: AccountPrefsPayload = {
  themeMode: 'system',
  accentTheme: 'indigo',
  calendarHeatMetric: 'volume',
  weekStartsOn: 'monday',
  weeklyWorkoutGoal: 4,
  enabledBodyMetrics: ['bodyweight', 'waist', 'arms', 'chest'],
  showWarmUpSets: true,
  showRpe: true,
  autoStartRest: true,
  defaultRestSeconds: 90,
  showSessionGhost: true,
};

export function pickAccountPrefs(state: Record<string, unknown>): AccountPrefsPayload {
  return {
    themeMode: typeof state.themeMode === 'string' ? state.themeMode : ACCOUNT_PREF_DEFAULTS.themeMode,
    accentTheme:
      typeof state.accentTheme === 'string' ? state.accentTheme : ACCOUNT_PREF_DEFAULTS.accentTheme,
    calendarHeatMetric:
      typeof state.calendarHeatMetric === 'string'
        ? state.calendarHeatMetric
        : ACCOUNT_PREF_DEFAULTS.calendarHeatMetric,
    weekStartsOn:
      typeof state.weekStartsOn === 'string' ? state.weekStartsOn : ACCOUNT_PREF_DEFAULTS.weekStartsOn,
    weeklyWorkoutGoal:
      typeof state.weeklyWorkoutGoal === 'number'
        ? state.weeklyWorkoutGoal
        : ACCOUNT_PREF_DEFAULTS.weeklyWorkoutGoal,
    enabledBodyMetrics: Array.isArray(state.enabledBodyMetrics)
      ? state.enabledBodyMetrics.filter((m): m is string => typeof m === 'string')
      : ACCOUNT_PREF_DEFAULTS.enabledBodyMetrics,
    showWarmUpSets:
      typeof state.showWarmUpSets === 'boolean'
        ? state.showWarmUpSets
        : ACCOUNT_PREF_DEFAULTS.showWarmUpSets,
    showRpe: typeof state.showRpe === 'boolean' ? state.showRpe : ACCOUNT_PREF_DEFAULTS.showRpe,
    autoStartRest:
      typeof state.autoStartRest === 'boolean'
        ? state.autoStartRest
        : ACCOUNT_PREF_DEFAULTS.autoStartRest,
    defaultRestSeconds:
      typeof state.defaultRestSeconds === 'number'
        ? state.defaultRestSeconds
        : ACCOUNT_PREF_DEFAULTS.defaultRestSeconds,
    showSessionGhost:
      typeof state.showSessionGhost === 'boolean'
        ? state.showSessionGhost
        : ACCOUNT_PREF_DEFAULTS.showSessionGhost,
  };
}

export function accountPrefsChanged(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  return JSON.stringify(pickAccountPrefs(a)) !== JSON.stringify(pickAccountPrefs(b));
}
