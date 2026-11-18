import { describe, expect, it } from 'vitest';

import { resolveDumbbellLoad, sanitizeDumbbellLoads } from '@/contracts/coaching/dumbbell-load';
import { shapeExerciseHistory } from '@/contracts/mcp/shape';
import { pickAccountPrefs } from '@/sync/account-prefs';

describe('dumbbell load', () => {
  it('labels dumbbell exercises only, override beats the account default', () => {
    expect(resolveDumbbellLoad('barbell', { 'catalog:seed:1': 'total' }, 'catalog:seed:1', 'total')).toBeNull();
    expect(resolveDumbbellLoad('dumbbell', {}, 'catalog:seed:2', undefined)).toBe('each');
    expect(resolveDumbbellLoad('dumbbell', {}, 'catalog:seed:2', 'total')).toBe('total');
    expect(resolveDumbbellLoad('Dumbbell', { 'catalog:seed:2': 'each' }, 'catalog:seed:2', 'total')).toBe('each');
  });

  it('drops malformed synced entries and round-trips through account prefs', () => {
    expect(sanitizeDumbbellLoads({ a: 'total', b: 'both', c: 3, '': 'each' })).toEqual({ a: 'total' });
    const p = pickAccountPrefs({ dumbbellLoadDefault: 'total', exerciseDumbbellLoads: { 'custom:x': 'each', y: 'nope' } });
    expect(p.dumbbellLoadDefault).toBe('total');
    expect(p.exerciseDumbbellLoads).toEqual({ 'custom:x': 'each' });
    expect(pickAccountPrefs({}).dumbbellLoadDefault).toBe('each');
  });

  it('MCP / Ask history says what the number means', () => {
    expect(shapeExerciseHistory('DB Curl', [], 'metric', 5, 'total')).toMatchObject({ weight_is: 'both dumbbells combined' });
    expect(shapeExerciseHistory('Bench', [], 'metric', 5)).not.toHaveProperty('weight_is');
  });
});
