import { describe, expect, it } from 'vitest';

import { SEED_EXERCISES } from '@/contracts/catalog/seed-exercises';
import {
  catalogMuscle,
  estimate1rm,
  matchExercise,
  parseCreateRoutine,
  rankExercises,
  seedIdFromExternal,
  TOOLS,
  toUnit,
  weeklyMuscleSets,
  type ExerciseCandidate,
} from '@/contracts/mcp/tools';
import { EXERCISES } from '@/db/seed';

const cand = (name: string, aliases: string[] = [], id = name): ExerciseCandidate => ({
  ref: { refType: 'catalog', externalId: id },
  name,
  aliases,
  primaryMuscle: 'chest',
  secondaryMuscles: [],
  equipment: 'barbell',
});

describe('seed catalog copy', () => {
  it('matches the bundled exercises (run scripts/gen-seed-catalog.mjs if this fails)', () => {
    expect(SEED_EXERCISES).toEqual(
      EXERCISES.map((e) => [e.id, e.name, e.primaryMuscle, e.secondaryMuscles, e.equipment, e.aliases]),
    );
  });
});

describe('tool list', () => {
  it('has unique names and object schemas; only create_routine writes', () => {
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
    for (const t of TOOLS) expect(t.inputSchema.type).toBe('object');
    expect(TOOLS.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name)).toEqual(['create_routine']);
  });
});

describe('matchExercise', () => {
  const list = [
    cand('Barbell Bench Press', ['bench', 'bp']),
    cand('Incline Dumbbell Press'),
    cand('Dumbbell Lateral Raise', ['lateral raise']),
    cand('Barbell Back Squat', ['squat']),
  ];
  it('matches exact names and aliases, case and plural insensitive', () => {
    expect(matchExercise('barbell bench press', list)?.name).toBe('Barbell Bench Press');
    expect(matchExercise('Bench', list)?.name).toBe('Barbell Bench Press');
    expect(matchExercise('Lateral Raises', list)?.name).toBe('Dumbbell Lateral Raise');
  });
  it('treats DB/dumbbell the same and falls back to shared words', () => {
    expect(matchExercise('Incline DB Press', list)?.name).toBe('Incline Dumbbell Press');
    expect(matchExercise('back squat', list)?.name).toBe('Barbell Back Squat');
  });
  it('returns null for unrelated names', () => {
    expect(matchExercise('Zottman Curl', list)).toBeNull();
  });
  it('does not match on short aliases as prefixes', () => {
    expect(matchExercise('Flyer', [cand('Front Squat', ['fs'])])).toBeNull();
    expect(matchExercise('bpm curl', [cand('Barbell Bench Press', ['bp'])])).toBeNull();
  });
  it('prefers earlier candidates on ties', () => {
    const tie = [cand('Push-Up', [], 'custom'), cand('Push-Up', [], 'seed:20')];
    expect(rankExercises('push up', tie, 1)[0]!.ref).toEqual({ refType: 'catalog', externalId: 'custom' });
  });
});

describe('parseCreateRoutine', () => {
  it('cleans, clamps and defaults rows', () => {
    const r = parseCreateRoutine({
      name: '  Upper A ',
      exercises: [{ exercise: 'Bench', sets: 14, reps_min: 12, reps_max: 8 }, { exercise: 'Row', sets: '3', reps_min: 10 }],
    });
    expect(r).toEqual({
      ok: true,
      value: {
        name: 'Upper A',
        description: '',
        rows: [
          { exercise: 'Bench', sets: 10, repsMin: 8, repsMax: 12, restSeconds: 90, notes: '' },
          { exercise: 'Row', sets: 3, repsMin: 10, repsMax: 10, restSeconds: 90, notes: '' },
        ],
      },
    });
  });
  it('rejects missing names, empty lists and rows without targets', () => {
    expect(parseCreateRoutine({ exercises: [] }).ok).toBe(false);
    expect(parseCreateRoutine({ name: 'A', exercises: [] }).ok).toBe(false);
    expect(parseCreateRoutine({ name: 'A', exercises: [{ exercise: 'Bench' }] }).ok).toBe(false);
  });
});

describe('training math', () => {
  it('estimates 1RM with Epley and ignores high-rep sets', () => {
    expect(estimate1rm(100, 1)).toBe(100);
    expect(estimate1rm(100, 5)).toBeCloseTo(116.67, 1);
    expect(estimate1rm(100, 15)).toBeNull();
    expect(estimate1rm(0, 5)).toBeNull();
  });
  it('converts kg to the user unit', () => {
    expect(toUnit(100, 'metric')).toBe(100);
    expect(toUnit(100, 'imperial')).toBe(220.5);
  });
  it('folds catalog muscle names onto app muscles', () => {
    expect(['upper-back', 'Quadriceps', 'pectorals', 'spine', 'calves'].map(catalogMuscle)).toEqual(['back', 'quads', 'chest', 'back', 'calves']);
  });
  it('reads seed refs in both spellings', () => {
    expect(seedIdFromExternal('seed:12')).toBe(12);
    expect(seedIdFromExternal('seed_1')).toBe(1);
    expect(seedIdFromExternal('chest/bench')).toBeNull();
  });
  it('counts primary sets fully and secondaries by half, per week', () => {
    const now = Date.parse('2026-11-05T12:00:00Z');
    const sets = [
      { startedAt: '2026-11-04T10:00:00Z', primaryMuscle: 'chest', secondaryMuscles: ['triceps'] },
      { startedAt: '2026-11-04T10:00:00Z', primaryMuscle: 'chest', secondaryMuscles: ['triceps'] },
      { startedAt: '2026-10-27T10:00:00Z', primaryMuscle: 'back', secondaryMuscles: [] },
      { startedAt: '2026-09-01T10:00:00Z', primaryMuscle: 'back', secondaryMuscles: [] },
    ];
    expect(weeklyMuscleSets(sets, 2, now)).toEqual({ chest: [2, 0], triceps: [1, 0], back: [0, 1] });
  });
});
