import { describe, expect, it } from 'vitest';

import { foldPullCursor } from '../cursor';
import { cloudToTemplateRef, templateRefToCloud } from '../mappers';

describe('foldPullCursor', () => {
  it('advances past applied rows when nothing is blocked', () => {
    expect(
      foldPullCursor(100, [
        { ms: 200, status: 'ok' },
        { ms: 500, status: 'ok' },
      ]),
    ).toBe(500);
  });

  it('does not advance past a blocked child', () => {
    expect(
      foldPullCursor(100, [
        { ms: 200, status: 'ok' },
        { ms: 300, status: 'blocked' },
        { ms: 800, status: 'ok' },
      ]),
    ).toBe(299);
  });

  it('keeps the current cursor when the first blocked row is next', () => {
    expect(foldPullCursor(100, [{ ms: 101, status: 'blocked' }])).toBe(100);
  });
});

describe('template refs', () => {
  it('never sends a seed template UUID to cloud', () => {
    expect(templateRefToCloud({ ref: 'seed', seedTemplateId: 3 })).toEqual({
      ref_type: 'seed',
      user_template_id: null,
      seed_template_id: 3,
    });
    expect(templateRefToCloud({ ref: 'custom', templateUuid: 'tpl-uuid' })).toEqual({
      ref_type: 'custom',
      user_template_id: 'tpl-uuid',
      seed_template_id: null,
    });
  });

  it('round-trips seed and custom refs', () => {
    expect(cloudToTemplateRef({ ref_type: 'seed', seed_template_id: 6 })).toEqual({
      ref: 'seed',
      seedTemplateId: 6,
    });
    expect(cloudToTemplateRef({ ref_type: 'custom', user_template_id: 'abc' })).toEqual({
      ref: 'custom',
      templateUuid: 'abc',
    });
  });
});
