import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_PREF_DEFAULTS,
  accountPrefsChanged,
  pickAccountPrefs,
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
});
