import { describe, expect, it } from 'vitest';

import { buildUpdateFor, type ReleaseRow } from '@/contracts/releases/update-check';

const row = (id: string, runtime: string, at: string, channel = 'alpha'): ReleaseRow => ({
  id, profile: channel, channel, runtime_version: runtime, title: null, notes: null, completed_at: at,
});
const feed = [row('b2', 'rt2', '2026-11-18T05:00:00Z'), row('b1', 'rt1', '2026-11-10T05:00:00Z')];

describe('buildUpdateFor', () => {
  it('offers the newest build when its runtime differs', () => {
    expect(buildUpdateFor(feed, { channel: 'alpha', runtimeVersion: 'rt1' })?.id).toBe('b2');
  });
  it('stays quiet when the install already has the latest runtime (OTA covers it)', () => {
    expect(buildUpdateFor(feed, { channel: 'alpha', runtimeVersion: 'rt2' })).toBeNull();
  });
  it('stays quiet for an install newer than the feed knows', () => {
    expect(buildUpdateFor([row('b3', 'rt3', '2026-11-20T00:00:00Z'), ...feed], { channel: 'alpha', runtimeVersion: 'rt3' })).toBeNull();
  });
  it('ignores other channels, Play builds and unknown installs', () => {
    expect(buildUpdateFor([row('x', 'rt9', '2026-12-01T00:00:00Z', 'beta')], { channel: 'alpha', runtimeVersion: 'rt1' })).toBeNull();
    expect(buildUpdateFor(feed, { channel: 'production', runtimeVersion: 'rt1' })).toBeNull();
    expect(buildUpdateFor(feed, { channel: null, runtimeVersion: 'rt1' })).toBeNull();
  });
});
