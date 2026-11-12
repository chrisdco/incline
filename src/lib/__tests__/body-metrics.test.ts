import { describe, expect, it } from 'vitest';

import { bodyEntriesForDisplay, bodyMetricUnit, sanitizeEnabledBodyMetrics } from '@/lib/body-metrics';
import { LB_PER_KG, labelledToCanonical } from '@/lib/units';

describe('sanitizeEnabledBodyMetrics', () => {
  it('keeps bodyweight and drops unknowns', () => {
    expect(sanitizeEnabledBodyMetrics(['waist', 'nope', 'arms'])).toEqual([
      'bodyweight',
      'waist',
      'arms',
    ]);
  });

  it('falls back to defaults', () => {
    expect(sanitizeEnabledBodyMetrics(null)).toContain('bodyweight');
  });
});

describe('bodyMetricUnit', () => {
  it('maps weight and length units from settings', () => {
    expect(bodyMetricUnit('bodyweight', 'metric')).toBe('kg');
    expect(bodyMetricUnit('bodyweight', 'imperial')).toBe('lb');
    expect(bodyMetricUnit('waist', 'metric')).toBe('cm');
    expect(bodyMetricUnit('waist', 'imperial')).toBe('in');
  });
});

describe('bodyEntriesForDisplay (#144)', () => {
  // Canonical rows as the queries return them: an old 'lb' row has already
  // been normalised by labelledToCanonical, so the series is all kg.
  const rows = [
    { id: 3, value: 80, recordedAt: 3 },
    { id: 2, value: labelledToCanonical(176.4, 'lb'), recordedAt: 2 },
    { id: 1, value: 80.5, recordedAt: 1 },
  ];

  it('keeps a mixed-origin series continuous (no 2.2x jump)', () => {
    const kg = bodyEntriesForDisplay(rows, 'bodyweight', 'metric').map((e) => e.value);
    expect(Math.max(...kg) / Math.min(...kg)).toBeLessThan(1.05);
  });

  it('rescales the whole series on a unit switch, storage untouched', () => {
    const kg = bodyEntriesForDisplay(rows, 'bodyweight', 'metric');
    const lb = bodyEntriesForDisplay(rows, 'bodyweight', 'imperial');
    lb.forEach((e, i) => expect(e.value / kg[i].value).toBeCloseTo(LB_PER_KG, 6));
    expect(kg.every((e) => e.unit === 'kg')).toBe(true);
    expect(lb.every((e) => e.unit === 'lb')).toBe(true);
    expect(rows[0].value).toBe(80);
  });

  it('converts circumferences cm to in', () => {
    const [waist] = bodyEntriesForDisplay([{ id: 1, value: 2.54 * 32, recordedAt: 1 }], 'waist', 'imperial');
    expect(waist.value).toBeCloseTo(32, 6);
    expect(waist.unit).toBe('in');
  });
});
