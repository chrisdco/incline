import { describe, expect, it } from 'vitest';

import { parseCatalogRouteId, parseDayParam, startOfLocalDay } from '@/lib/route-params';

const NOW = new Date(2026, 10, 11, 15, 42).getTime();
const TODAY = new Date(2026, 10, 11).getTime();

describe('parseDayParam', () => {
  it('normalises a valid epoch ms to the start of its local day', () => {
    const ms = new Date(2026, 9, 3, 18, 5).getTime();
    expect(parseDayParam(String(ms), NOW)).toBe(new Date(2026, 9, 3).getTime());
  });

  it('keeps a day-start value as is', () => {
    expect(parseDayParam(String(TODAY), NOW)).toBe(TODAY);
  });

  it.each([
    ['NaN', 'NaN'],
    ['junk', 'abc'],
    ['empty', ''],
    ['whitespace', '  '],
    ['Infinity', 'Infinity'],
    ['out of Date range', '1e20'],
  ])('falls back to today for %s', (_, raw) => {
    expect(parseDayParam(raw, NOW)).toBe(TODAY);
  });

  it('falls back to today for a missing or repeated param', () => {
    expect(parseDayParam(undefined, NOW)).toBe(TODAY);
    expect(parseDayParam(['1', '2'], NOW)).toBe(TODAY);
  });
});

describe('startOfLocalDay', () => {
  it('drops the time of day', () => {
    expect(startOfLocalDay(NOW)).toBe(TODAY);
  });
});

describe('parseCatalogRouteId', () => {
  it('extracts the external id from a catalog link', () => {
    expect(parseCatalogRouteId('supabase:abc-123')).toBe('abc-123');
  });

  it('returns null for local ids and an empty external id', () => {
    expect(parseCatalogRouteId('42')).toBeNull();
    expect(parseCatalogRouteId('supabase:')).toBeNull();
  });
});
