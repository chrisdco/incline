import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-application', () => ({}));
vi.mock('expo-updates', () => ({}));

import { releaseDetails, type ReleaseInfo } from '../release';

const base: ReleaseInfo = {
  stage: 'alpha',
  version: '1.0.0',
  build: '12',
  updateId: 'a1b2c3d4',
  updateCreatedAt: new Date('2026-11-27T08:00:00Z'),
  runtimeVersion: '18fc7f1e9a0b',
  channel: 'alpha',
};

describe('releaseDetails', () => {
  it('lists version, stage, update and short runtime', () => {
    expect(releaseDetails(base)).toBe(
      ['Incline 1.0.0 (build 12)', 'Stage: Alpha · channel alpha', 'Update: a1b2c3d4 · 2026-11-27', 'Runtime: 18fc7f1e'].join('\n'),
    );
  });

  it('says built-in bundle when no OTA is running', () => {
    const out = releaseDetails({ ...base, updateId: null, updateCreatedAt: null, runtimeVersion: null, channel: null, build: null });
    expect(out).toBe(['Incline 1.0.0', 'Stage: Alpha', 'Update: built-in bundle'].join('\n'));
  });
});
