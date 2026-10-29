import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  convertWeight,
  detectSource,
  parseCsvText,
  parseExportCsv,
  toKg,
  type ParseResult,
} from '../csv-parse';
import { matchExerciseNames, normaliseName, splitEquipment, type CatalogCandidate } from '../match';
import { dedupeKey, filterExisting, importStats, planWorkouts } from '../plan';

const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

function parse(name: string, unit: 'kg' | 'lb' = 'kg'): ParseResult {
  const r = parseExportCsv(fixture(name), unit);
  if ('error' in r) throw new Error(r.error);
  return r;
}

describe('format detection', () => {
  it('detects Strong and Hevy from headers', () => {
    expect(detectSource(parseCsvText(fixture('strong.csv')).headers)).toBe('strong');
    expect(detectSource(parseCsvText(fixture('hevy.csv')).headers)).toBe('hevy');
    expect(detectSource(parseCsvText(fixture('hevy-lb.csv')).headers)).toBe('hevy');
  });

  it('rejects other CSVs', () => {
    expect(parseExportCsv('a,b\n1,2\n', 'kg')).toEqual({ error: expect.stringContaining('Not a Strong or Hevy') });
  });

  it('reads quoted fields with commas, CRLF and a BOM', () => {
    const { headers, rows } = parseCsvText('﻿a,b\r\n"x, y","he said ""hi"""\r\n');
    expect(headers).toEqual(['a', 'b']);
    expect(rows).toEqual([{ a: 'x, y', b: 'he said "hi"' }]);
  });
});

describe('parsing', () => {
  it('Strong: groups workouts, maps W/D/F set types, keeps RPE, skips rest rows', () => {
    const r = parse('strong.csv', 'lb');
    expect(r.workouts).toHaveLength(2);
    const push = r.workouts[0];
    expect(push.title).toBe('Push Day');
    const bench = push.exercises.find((e) => e.name === 'Bench Press (Barbell)')!;
    expect(bench.sets.map((s) => s.setType)).toEqual(['warmup', 'working', 'drop']);
    expect(bench.sets[1].rpe).toBe(8);
    expect(bench.notes).toBe('felt good, fast');
    const lat = push.exercises.find((e) => e.name === 'Lateral Raise (Dumbbell)')!;
    expect(lat.sets).toHaveLength(1);
    expect(lat.sets[0].setType).toBe('failure');
    expect(r.warnings.some((w) => w.message.includes('Rest Timer'))).toBe(true);
    // "1h 5m" duration → end = start + 65 min
    expect(new Date(push.endIso).getTime() - new Date(push.startIso).getTime()).toBe(65 * 60_000);
    expect(r.errors).toEqual([]);
  });

  it('Hevy: Hermes-safe date parse, dropset/failure, RPE rounded', () => {
    const r = parse('hevy.csv');
    expect(r.fileUnit).toBe('kg');
    const w = r.workouts[0];
    expect(new Date(w.startIso).getTime()).toBe(new Date(2024, 0, 15, 18, 30).getTime());
    const squat = w.exercises[0];
    expect(squat.sets.map((s) => s.setType)).toEqual(['warmup', 'working', 'drop']);
    expect(squat.sets[1].rpe).toBe(9);
    expect(w.exercises[1].sets[0].setType).toBe('failure');
  });

  it('Hevy imperial file is detected as lb', () => {
    expect(parse('hevy-lb.csv').fileUnit).toBe('lb');
  });
});

describe('unit conversion', () => {
  it('converts lb to canonical kg', () => {
    expect(toKg(225, 'lb')).toBe(102.06);
    expect(toKg(100, 'kg')).toBe(100);
    expect(convertWeight(100, 'kg', 'lb')).toBe(220.46);
  });

  it('plans lb exports in kg', () => {
    const planned = planWorkouts(parse('hevy-lb.csv'));
    expect(planned[0].exercises[0].sets[0].weightKg).toBe(20.41);
    const strong = planWorkouts(parse('strong.csv', 'lb'));
    expect(strong[0].exercises[0].sets[1].weightKg).toBe(83.91);
  });

  it('honours a per-row Strong "Weight Unit" column', () => {
    const csv = 'Date,Workout Name,Exercise Name,Set Order,Weight,Weight Unit,Reps\n2024-01-01 10:00:00,A,Squat,1,100,kg,5\n';
    const r = parseExportCsv(csv, 'lb');
    if ('error' in r) throw new Error(r.error);
    expect(planWorkouts(r)[0].exercises[0].sets[0].weightKg).toBe(100);
  });
});

describe('fuzzy matching', () => {
  const catalog: CatalogCandidate[] = [
    { id: 1, name: 'Barbell Bench Press', aliases: ['bench press'], equipment: 'barbell' },
    { id: 2, name: 'Dumbbell Bench Press', aliases: [], equipment: 'dumbbell' },
    { id: 3, name: 'Dumbbell Lateral Raise', aliases: [], equipment: 'dumbbell' },
    { id: 4, name: 'Pull-Up', aliases: [], equipment: 'bodyweight' },
    { id: 5, name: 'Back Squat', aliases: [], equipment: 'barbell' },
    { id: 6, name: 'Cable Lateral Raise', aliases: [], equipment: 'cable' },
  ];

  it('normalises case, punctuation and plurals', () => {
    expect(normaliseName('Pull-Ups')).toBe('pull up');
    expect(splitEquipment('Bench Press (Barbell)')).toEqual({ core: 'bench press', equipment: 'barbell' });
    expect(splitEquipment('DB Lateral Raises')).toEqual({ core: 'lateral raise', equipment: 'dumbbell' });
  });

  it('matches by core name + equipment confidently', () => {
    const [bench, dbBench, lat, pull] = matchExerciseNames(
      ['Bench Press (Barbell)', 'Bench Press (Dumbbell)', 'Lateral Raise (Dumbbell)', 'Pull Up'],
      catalog,
    );
    expect(bench).toMatchObject({ exerciseId: 1, confidence: 'confident' });
    expect(dbBench).toMatchObject({ exerciseId: 2, confidence: 'confident' });
    expect(lat).toMatchObject({ exerciseId: 3, confidence: 'confident' });
    expect(pull).toMatchObject({ exerciseId: 4, confidence: 'confident' });
  });

  it('flags ambiguous / partial matches for review and leaves unknowns unmatched', () => {
    const [ambiguous, partial, unknown] = matchExerciseNames(
      ['Lateral Raise (Machine)', 'Squat (Barbell)', 'Zercher Carry Thing'],
      catalog,
    );
    expect(ambiguous.confidence).toBe('review');
    expect(partial).toMatchObject({ exerciseId: 5, confidence: 'review' });
    expect(unknown).toMatchObject({ exerciseId: null, confidence: 'none' });
  });
});

describe('dedupe', () => {
  it('keys by start minute + normalised name', () => {
    const t = new Date(2024, 0, 15, 18, 30, 0).getTime();
    expect(dedupeKey(t, 'Push Day')).toBe(dedupeKey(t + 45_000, 'push day!'));
    expect(dedupeKey(t, 'Push Day')).not.toBe(dedupeKey(t + 60_000, 'Push Day'));
    expect(dedupeKey(t, 'Push Day')).not.toBe(dedupeKey(t, 'Pull Day'));
  });

  it('re-importing the same file skips everything', () => {
    const planned = planWorkouts(parse('strong.csv'));
    const existing = planned.map((p) => ({ started_at: p.startedAt, name: p.name }));
    expect(filterExisting(planned, existing)).toEqual({ fresh: [], skipped: 2 });
    expect(filterExisting(planned, []).fresh).toHaveLength(2);
  });

  it('reports stats for the preview', () => {
    const s = importStats(planWorkouts(parse('strong.csv')));
    expect(s).toMatchObject({ workouts: 2, sets: 6 });
    expect(s.firstAt).toBe(new Date(2024, 0, 15, 18, 30).getTime());
    expect(s.lastAt).toBe(new Date(2024, 0, 17, 7, 0).getTime());
  });
});
