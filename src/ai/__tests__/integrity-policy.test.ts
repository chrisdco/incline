import { describe, expect, it } from 'vitest';

import { attestedLimit, integrityProblem, type IntegrityPayload } from '@/contracts/ai/integrity';

const NOW = 1_800_000_000_000;
const expectations = { packageName: 'com.chrisdc777.incline', nonce: 'n-1', now: NOW, certDigests: ['ourcert'] };

const payload = (o: Partial<IntegrityPayload> = {}): IntegrityPayload => ({
  requestDetails: { requestPackageName: 'com.chrisdc777.incline', requestHash: 'n-1', timestampMillis: String(NOW - 5000) },
  appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED', packageName: 'com.chrisdc777.incline', certificateSha256Digest: ['playcert'] },
  deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
  ...o,
});

describe('integrityProblem', () => {
  it('passes a Play-recognised app on a real device', () => {
    expect(integrityProblem(payload(), expectations)).toBeNull();
  });

  it('passes a sideloaded build signed with our cert', () => {
    const p = payload({
      appIntegrity: { appRecognitionVerdict: 'UNRECOGNIZED_VERSION', packageName: 'com.chrisdc777.incline', certificateSha256Digest: ['ourcert'] },
    });
    expect(integrityProblem(p, expectations)).toBeNull();
  });

  it('fails a re-signed app', () => {
    const p = payload({
      appIntegrity: { appRecognitionVerdict: 'UNRECOGNIZED_VERSION', packageName: 'com.chrisdc777.incline', certificateSha256Digest: ['other'] },
    });
    expect(integrityProblem(p, expectations)).toBe('app');
  });

  it('fails a wrong nonce, a stale token and an emulator', () => {
    expect(integrityProblem(payload(), { ...expectations, nonce: 'n-2' })).toBe('nonce');
    expect(integrityProblem(payload(), { ...expectations, now: NOW + 10 * 60_000 })).toBe('stale');
    expect(integrityProblem(payload({ deviceIntegrity: { deviceRecognitionVerdict: [] } }), expectations)).toBe('device');
  });
});

describe('attestedLimit', () => {
  it('halves only unverified, non-tester requests', () => {
    expect(attestedLimit(150, 1, 'verified')).toBe(150);
    expect(attestedLimit(150, 1, 'off')).toBe(150);
    expect(attestedLimit(150, 1, 'unverified')).toBe(75);
    expect(attestedLimit(150, 5, 'unverified')).toBe(750);
    expect(attestedLimit(1, 1, 'unverified')).toBe(1);
  });
});
