import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { kindsFrom, sleepMinutes } from '../health-connect';
import { compareToBaseline, healthStatusLine, lastNightMinutes, readHealthSnapshot, readinessFrom } from '../readiness';
import { UNAVAILABLE_HEALTH, type HealthPort, type PointSample } from '../types';
import { readinessResult, deviceHealthTools } from '@/ai/capabilities/health-tools';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-11-16T08:00:00Z');

/** One reading a day for `days` days before today, plus today's. */
function series(usual: number, today: number, days = 14): PointSample[] {
  const out: PointSample[] = [];
  for (let d = days; d >= 1; d--) out.push({ at: NOW - d * DAY, value: usual + (d % 2 ? 1 : -1) });
  out.push({ at: NOW - 2 * HOUR, value: today });
  return out;
}

describe('readiness rule', () => {
  it('compares today to the median of earlier days, and needs a week-ish of history', () => {
    expect(compareToBaseline(series(60, 48), NOW)).toEqual({ today: 48, baseline: 60 });
    expect(compareToBaseline(series(60, 48, 3), NOW)).toBe(null);
    expect(compareToBaseline(series(60, 48).slice(0, -1), NOW)).toBe(null);
  });

  it('suggests tired on two strain signals, ok on one, fresh when all good', () => {
    const lowHrv = { today: 48, baseline: 60 };
    const highRhr = { today: 62, baseline: 55 };
    expect(readinessFrom({ sleepMinutes: 340, hrv: lowHrv, restingHeartRate: null })?.level).toBe('tired');
    expect(readinessFrom({ sleepMinutes: 480, hrv: lowHrv, restingHeartRate: { today: 55, baseline: 55 } })?.level).toBe('ok');
    expect(readinessFrom({ sleepMinutes: 480, hrv: { today: 66, baseline: 60 }, restingHeartRate: { today: 52, baseline: 55 } })?.level).toBe('fresh');
    expect(readinessFrom({ sleepMinutes: 280, hrv: null, restingHeartRate: null })?.level).toBe('tired');
    expect(readinessFrom({ sleepMinutes: null, hrv: lowHrv, restingHeartRate: highRhr })?.signals.map((s) => s.text)).toEqual([
      'HRV 20% under your usual',
      'Resting HR 7 bpm above usual',
    ]);
    expect(readinessFrom({ sleepMinutes: null, hrv: null, restingHeartRate: null })).toBe(null);
  });

  it('counts sessions that ended in the last 18 hours as last night', () => {
    const nights = [
      { start: NOW - 9 * HOUR, end: NOW - HOUR, minutes: 420 },
      { start: NOW - 30 * HOUR, end: NOW - 24 * HOUR, minutes: 400 },
    ];
    expect(lastNightMinutes(nights, NOW)).toBe(420);
    expect(lastNightMinutes([], NOW)).toBe(null);
  });
});

describe('Health Connect mapping', () => {
  it('removes awake and out-of-bed stages from sleep', () => {
    const iso = (h: number) => new Date(NOW + h * HOUR).toISOString();
    expect(
      sleepMinutes({
        startTime: iso(-8),
        endTime: iso(0),
        stages: [
          { startTime: iso(-8), endTime: iso(-7.5), stage: 1 },
          { startTime: iso(-7.5), endTime: iso(-1), stage: 4 },
          { startTime: iso(-1), endTime: iso(-0.75), stage: 3 },
        ],
      }),
    ).toBe(8 * 60 - 45);
  });

  it('maps granted read permissions back to our kinds only', () => {
    expect(
      kindsFrom([
        { accessType: 'read', recordType: 'SleepSession' },
        { accessType: 'write', recordType: 'Weight' },
        { accessType: 'read', recordType: 'Nutrition' },
        { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
      ]),
    ).toEqual(['sleep', 'hrv']);
  });
});

describe('health snapshot and Ask tool', () => {
  const port: HealthPort = {
    ...UNAVAILABLE_HEALTH,
    availability: async () => 'available',
    granted: async () => ['sleep', 'hrv', 'steps'],
    readSleep: async () => [{ start: NOW - 9 * HOUR, end: NOW - HOUR, minutes: 330 }],
    readPoints: async (kind) => (kind === 'hrv' ? series(60, 48) : []),
    readSteps: async () => 1234,
  };

  it('reads only what is shared and reduces it to daily totals', async () => {
    const s = await readHealthSnapshot(port, NOW);
    expect(s).toMatchObject({ lastNightSleepMinutes: 330, hrv: { today: 48, baseline: 60 }, restingHeartRate: null, stepsToday: 1234, latestWeightKg: null });
    expect(s.suggestion?.level).toBe('tired');
    expect(readinessResult(s)).toMatchObject({ hrv_ms: { today: 48, usual: 60 }, suggestion: { level: 'tired' } });
  });

  it('a failing read is empty, not an error', async () => {
    const s = await readHealthSnapshot({ ...port, readSleep: async () => Promise.reject(new Error('revoked')) }, NOW);
    expect(s.lastNightSleepMinutes).toBe(null);
  });

  it('Ask only gets the tool with Health Connect and "Use in Ask" both on', () => {
    expect(deviceHealthTools({ healthConnectEnabled: true, healthInAskEnabled: false }, () => port)).toEqual([]);
    expect(deviceHealthTools({ healthConnectEnabled: false, healthInAskEnabled: true }, () => port)).toEqual([]);
    const [tool] = deviceHealthTools({ healthConnectEnabled: true, healthInAskEnabled: true }, () => port);
    expect(tool?.spec).toMatchObject({ name: 'get_readiness', kind: 'read', dataCategories: ['health'] });
  });
});

describe('health status line (Home, Health screen, Ask)', () => {
  it('says what is shared but not arriving, and how far the baseline is', async () => {
    const port: HealthPort = {
      ...UNAVAILABLE_HEALTH,
      granted: async () => ['sleep', 'hrv', 'restingHeartRate'],
      readSleep: async () => [],
      // Two earlier days plus today: still learning.
      readPoints: async (kind) => (kind === 'hrv' ? [{ at: NOW - 3 * DAY, value: 50 }, { at: NOW - 2 * DAY, value: 52 }, { at: NOW - HOUR, value: 49 }] : []),
    };
    const s = await readHealthSnapshot(port, NOW);
    expect(s.coverage.hrv).toMatchObject({ days: 3, baselineDays: 2 });
    expect(healthStatusLine(s)).toBe('No sleep or resting HR in Health Connect yet · Learning your usual (2/5 days)');
    expect(readinessResult(s)).toMatchObject({ status: healthStatusLine(s) });
  });

  it('is quiet when nothing is shared or everything is arriving', () => {
    expect(healthStatusLine({ granted: [], coverage: {} })).toBe(null);
    expect(healthStatusLine({ granted: ['sleep', 'hrv'], coverage: { sleep: { days: 7, lastAt: NOW }, hrv: { days: 20, lastAt: NOW, baselineDays: 19 } } })).toBe(null);
  });
});
