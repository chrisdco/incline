import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: async (_algo: string, value: string) =>
    createHash('sha256').update(value, 'utf8').digest('hex'),
}));

import { COACHING_RULE_VERSION } from '../types';
import { buildFeaturePackV1, type FeaturePackV1 } from '../feature-pack';
import { requestCoachNarration } from '../narrate-client';
import { sanitizeNarrationResponse, validateNarrationResponse } from '../narrate-validate';

function packWithInsight(): FeaturePackV1 {
  return buildFeaturePackV1({
    unit: 'metric',
    surface: 'home',
    insights: [
      {
        id: 'volume-trend',
        kind: 'volume_trend',
        severity: 'success',
        title: 'Volume is climbing',
        body: 'Volume +12% vs last week',
        ruleVersion: COACHING_RULE_VERSION,
      },
    ],
    suggestions: [
      {
        exerciseId: 1,
        exerciseName: 'Bench',
        weight: 80,
        reps: 8,
        targetSets: 3,
        reasonCode: 'hit_rep_range_increase_load',
        reasonText: 'add load',
        ruleVersion: COACHING_RULE_VERSION,
      },
    ],
    aggregates: { volumeDeltaPct: 12, prCount: 1 },
  });
}

describe('validateNarrationResponse', () => {
  const pack = packWithInsight();

  it('accepts a short headline, 1–3 paragraphs, and cited ids from the pack', () => {
    const result = validateNarrationResponse(
      {
        headline: 'Volume is up 12%',
        paragraphs: ['You added 12% volume. Bench stays at 80.'],
        citedInsightIds: ['volume-trend'],
      },
      pack,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.narration.headline).toBe('Volume is up 12%');
      expect(result.narration.citedInsightIds).toEqual(['volume-trend']);
    }
  });

  it('truncates headlines over 80 characters instead of failing', () => {
    const result = validateNarrationResponse(
      {
        headline: 'x'.repeat(81),
        paragraphs: ['Volume +12% vs last week'],
        citedInsightIds: ['volume-trend'],
      },
      pack,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.narration.headline).toBe('x'.repeat(80));
  });

  it('sanitizes recoverable padding instead of failing: trims, caps paragraphs, drops unknown ids', () => {
    const result = validateNarrationResponse(
      {
        headline: '  Volume is up 12%  ',
        paragraphs: ['  You added 12% volume.  ', '', 'Bench stays at 80.', 'extra padded para'],
        citedInsightIds: ['volume-trend', 'not-a-real-id', 'volume-trend'],
      },
      pack,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.narration.headline).toBe('Volume is up 12%');
      expect(result.narration.paragraphs).toEqual([
        'You added 12% volume.',
        'Bench stays at 80.',
        'extra padded para',
      ]);
      expect(result.narration.citedInsightIds).toEqual(['volume-trend']);
    }
  });

  it('still rejects unrecoverable output: empty headline, no paragraphs, invented numbers', () => {
    expect(
      validateNarrationResponse(
        { headline: '   ', paragraphs: ['Volume +12% vs last week'], citedInsightIds: [] },
        pack,
      ).ok,
    ).toBe(false);
    expect(
      validateNarrationResponse(
        { headline: 'Keep going', paragraphs: [], citedInsightIds: [] },
        pack,
      ).ok,
    ).toBe(false);
    expect(
      validateNarrationResponse(
        {
          headline: 'Try 225 next',
          paragraphs: ['That load is not in the pack.'],
          citedInsightIds: ['volume-trend'],
        },
        pack,
      ).ok,
    ).toBe(false);
  });

  it('sanitizeNarrationResponse never invents content', () => {
    const sanitized = sanitizeNarrationResponse(
      {
        headline: 'Keep going',
        paragraphs: ['Volume +12% vs last week'],
        citedInsightIds: ['not-a-real-id'],
      },
      pack,
    ) as Record<string, unknown>;
    expect(sanitized.headline).toBe('Keep going');
    expect(sanitized.citedInsightIds).toEqual([]);
  });
});

describe('requestCoachNarration skip paths', () => {
  const pack = packWithInsight();
  const fetchImpl = vi.fn();

  it('returns null without a user id', async () => {
    const result = await requestCoachNarration(
      { surface: 'home', pack, getToken: async () => 'token', userId: null },
      { aiExplanationsEnabled: true, backendReady: true, fetchImpl },
    );
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns null when AI explanations are off', async () => {
    const result = await requestCoachNarration(
      { surface: 'home', pack, getToken: async () => 'token', userId: 'user_1' },
      { aiExplanationsEnabled: false, backendReady: true, fetchImpl },
    );
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns null when the sync backend is not ready', async () => {
    const result = await requestCoachNarration(
      { surface: 'home', pack, getToken: async () => 'token', userId: 'user_1' },
      { aiExplanationsEnabled: true, backendReady: false, fetchImpl },
    );
    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('session logging isolation', () => {
  it('does not import narrate-client', () => {
    const src = readFileSync(new URL('../../app/session/[id].tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/narrate-client/);
  });
});
