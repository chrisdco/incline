import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_PREF_DEFAULTS,
  accountPrefsChanged,
  pickAccountPrefs,
  sanitizeExerciseWeightUnits,
} from '../account-prefs';

describe('account preferences', () => {
  it('omits device-local keys from the cloud payload', () => {
    const picked = pickAccountPrefs({
      ...ACCOUNT_PREF_DEFAULTS,
      hapticsEnabled: false,
      restSoundEnabled: false,
      keepScreenAwake: false,
      workoutRemindersEnabled: true,
      aiExplanationsEnabled: true,
      unit: 'imperial',
      dismissedAnnouncementIds: ['promo-1'],
    });
    expect(picked).not.toHaveProperty('hapticsEnabled');
    expect(picked).not.toHaveProperty('unit');
    expect(picked).not.toHaveProperty('aiExplanationsEnabled');
    expect(picked.showSessionGhost).toBe(true);
  });

  it('detects account-key edits without device-key noise', () => {
    const a = { ...ACCOUNT_PREF_DEFAULTS, hapticsEnabled: true };
    const b = { ...ACCOUNT_PREF_DEFAULTS, hapticsEnabled: false };
    const c = { ...ACCOUNT_PREF_DEFAULTS, themeMode: 'dark', hapticsEnabled: true };
    expect(accountPrefsChanged(a, b)).toBe(false);
    expect(accountPrefsChanged(a, c)).toBe(true);
  });

  it('syncs per-exercise weight units and drops junk entries', () => {
    const picked = pickAccountPrefs({
      ...ACCOUNT_PREF_DEFAULTS,
      exerciseWeightUnits: { 'catalog:0025': 'imperial', 'custom:abc': 'metric', bad: 'stone', '': 'metric' },
    });
    expect(picked.exerciseWeightUnits).toEqual({ 'catalog:0025': 'imperial', 'custom:abc': 'metric' });
    expect(sanitizeExerciseWeightUnits(null)).toEqual({});
    expect(sanitizeExerciseWeightUnits(['imperial'])).toEqual({});
  });

  it('counts a per-exercise unit change as an account-pref edit', () => {
    const before = { ...ACCOUNT_PREF_DEFAULTS, exerciseWeightUnits: {} };
    const after = { ...ACCOUNT_PREF_DEFAULTS, exerciseWeightUnits: { 'catalog:0025': 'imperial' } };
    expect(accountPrefsChanged(after, before)).toBe(true);
  });
});
