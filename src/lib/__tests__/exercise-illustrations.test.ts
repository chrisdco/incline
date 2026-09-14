import { describe, expect, it } from 'vitest';

import {
  getIllustrationFrames,
  resolveIllustrationSlug,
} from '@/lib/exercise-illustrations';

describe('resolveIllustrationSlug', () => {
  it('maps exact catalog names', () => {
    expect(resolveIllustrationSlug('Bench Press')).toBe('bench-press');
    expect(resolveIllustrationSlug('Deadlift')).toBe('deadlift');
    expect(resolveIllustrationSlug('Pull-Up')).toBe('pull-up');
  });

  it('handles plurals and spacing variants', () => {
    expect(resolveIllustrationSlug('Push Ups')).toBe('push-up');
    expect(resolveIllustrationSlug('Skull Crushers')).toBe('skull-crusher');
    expect(resolveIllustrationSlug('Walking Lunges')).toBe('walking-lunge');
    expect(resolveIllustrationSlug('Step Ups')).toBe('step-up');
    expect(resolveIllustrationSlug('Chin Ups')).toBe('chin-up');
  });

  it('matches seeded exercise names', () => {
    expect(resolveIllustrationSlug('Barbell Bench Press')).toBe('bench-press');
    expect(resolveIllustrationSlug('Barbell Back Squat')).toBe('squat');
    expect(resolveIllustrationSlug('Conventional Deadlift')).toBe('deadlift');
    expect(resolveIllustrationSlug('Standing Overhead Press')).toBe('overhead-press');
    expect(resolveIllustrationSlug('Dumbbell Row (Single Arm)')).toBe('one-arm-dumbbell-row');
    expect(resolveIllustrationSlug('Calf Raise (Standing)')).toBe('standing-calf-raise');
  });

  it('uses curated aliases', () => {
    expect(resolveIllustrationSlug('Crunches')).toBe('crunch');
    expect(resolveIllustrationSlug("Farmer's Walk")).toBe('farmer-carry');
    expect(resolveIllustrationSlug('Cable Crossover')).toBe('cable-fly');
  });

  it('prefers alias hints passed by the caller', () => {
    expect(resolveIllustrationSlug('Barbell Curl', ['bb curl'])).toBe('bicep-curl');
  });

  it('falls back to fuzzy matching within tolerance', () => {
    expect(resolveIllustrationSlug('Lever Seated Hip Abduction')).toBeTruthy();
    expect(resolveIllustrationSlug('Barbell Hack Squat')).toBe('hack-squat');
  });

  it('returns null for exercises with no plausible illustration', () => {
    expect(resolveIllustrationSlug('Snatch')).toBeNull();
    expect(resolveIllustrationSlug('Clean and Press')).toBeNull();
    expect(resolveIllustrationSlug('Zottman Curl')).toBeNull();
    expect(resolveIllustrationSlug('')).toBeNull();
  });
});

describe('getIllustrationFrames', () => {
  it('builds three pinned CDN frame URLs', () => {
    const frames = getIllustrationFrames('bench-press');
    expect(frames).toHaveLength(3);
    expect(frames[0]).toContain('/assets/bench-press/frame-1.svg');
    expect(frames[2]).toContain('/assets/bench-press/frame-3.svg');
  });
});
