import { describe, expect, it } from 'vitest';

import {
  buildSearchText,
  damerauLevenshtein,
  matchToken,
  normalizeSearchText,
  scoreField,
  singularize,
  tokenize,
  typoBudget,
} from '../exercise-search';

describe('normalizeSearchText', () => {
  it('folds case, diacritics, punctuation and equipment parens', () => {
    expect(normalizeSearchText('Bench Press (Barbell)')).toBe('bench press barbell');
    expect(normalizeSearchText('  Déficit   Deadlift!! ')).toBe('deficit deadlift');
  });
});

describe('singularize + tokenize', () => {
  it('folds plurals', () => {
    expect(singularize('curls')).toBe('curl');
    expect(singularize('presses')).toBe('press');
    expect(singularize('boxes')).toBe('box');
  });

  it('keeps words that merely end in s-sounds', () => {
    expect(singularize('press')).toBe('press');
    expect(singularize('class')).toBe('class');
    expect(singularize('latissimus')).toBe('latissimus');
  });

  it('tokenizes to singular tokens', () => {
    expect(tokenize('Seated Cable Rows')).toEqual(['seated', 'cable', 'row']);
  });
});

describe('damerauLevenshtein', () => {
  it('counts adjacent transpositions as one (the gym typo)', () => {
    expect(damerauLevenshtein('bnech', 'bench')).toBe(1);
    expect(damerauLevenshtein('bench', 'bench')).toBe(0);
    expect(damerauLevenshtein('bench', 'squat')).toBeGreaterThan(2);
  });

  it('scales the typo budget by length', () => {
    expect(typoBudget('db')).toBe(0);
    expect(typoBudget('bench')).toBe(1);
    expect(typoBudget('pulldown')).toBe(2);
  });
});

describe('matchToken', () => {
  const candidates = ['bench', 'press', 'barbell'];

  it('ranks exact above prefix above substring above fuzzy', () => {
    expect(matchToken('press', candidates)).toBe('exact');
    expect(matchToken('pre', candidates)).toBe('prefix');
    expect(matchToken('ench', candidates)).toBe('substring');
    expect(matchToken('bnech', candidates)).toBe('fuzzy');
    expect(matchToken('squat', candidates)).toBe('none');
  });

  it('treats short prefixes as prefixes, not typos', () => {
    // 'db' is a genuine prefix of 'dbs' — prefix wins by design.
    expect(matchToken('db', ['dbs'])).toBe('prefix');
    expect(matchToken('bx', ['bench', 'press'])).toBe('none');
  });
});

describe('scoreField', () => {
  const field = ['bench', 'press', 'barbell'];

  it('is order-free across tokens', () => {
    const hit = scoreField(['press', 'bench'], field, {
      exact: 100,
      prefix: 88,
      substring: 72,
      fuzzy: 55,
      matchedOn: 'name',
    });
    expect(hit?.score).toBe(100);
  });

  it('requires every token (AND semantics)', () => {
    const hit = scoreField(['bench', 'squat'], field, {
      exact: 100,
      prefix: 88,
      substring: 72,
      fuzzy: 55,
      matchedOn: 'name',
    });
    expect(hit).toBeNull();
  });

  it('marks all-fuzzy matches', () => {
    const hit = scoreField(['bnech'], field, {
      exact: 100,
      prefix: 88,
      substring: 72,
      fuzzy: 55,
      matchedOn: 'name',
    });
    expect(hit).toEqual({ score: 55, matchedOn: 'fuzzy' });
  });
});

describe('buildSearchText', () => {
  it('joins normalized parts', () => {
    expect(
      buildSearchText({ name: 'Bench Press (Barbell)', primaryMuscle: 'chest', equipment: 'barbell' }),
    ).toBe('bench press barbell chest barbell');
  });
});
