import { describe, expect, it } from 'vitest';

import { buildUserMessage } from '@/contracts/templates/prompt';
import {
  applyDiffToRows,
  estimateMinutes,
  parseTemplateDiff,
  parseTemplateEditInput,
  type TemplateEditInput,
} from '@/contracts/templates/template-edit';

const pushB: TemplateEditInput = {
  templateName: 'Push B',
  intent: 'Swap overhead press for something easier on my shoulders',
  rows: [
    { ref: 'e1', name: 'Bench Press', sets: 4, repsMin: 6, repsMax: 8 },
    { ref: 'e2', name: 'Overhead Press', sets: 3, repsMin: 8, repsMax: 10 },
    { ref: 'e3', name: 'Lateral Raise', sets: 3, repsMin: 12, repsMax: 15 },
  ],
};

describe('parseTemplateEditInput', () => {
  it('accepts the app snapshot and rejects out-of-order refs', () => {
    expect(parseTemplateEditInput(pushB)).toEqual({ ok: true, value: pushB });
    const bad = { ...pushB, rows: [pushB.rows[1], pushB.rows[0]] };
    expect(parseTemplateEditInput(bad).ok).toBe(false);
    expect(parseTemplateEditInput({ ...pushB, intent: '   ' }).ok).toBe(false);
  });
});

describe('parseTemplateDiff', () => {
  it('passes a decline through', () => {
    expect(parseTemplateDiff({ decline: 'See a physio first.' }, pushB)).toEqual({
      ok: true,
      value: { decline: 'See a physio first.' },
    });
  });

  it('drops unknown refs and junk, clamps sets and reps, swaps inverted ranges', () => {
    const res = parseTemplateDiff(
      {
        summary: 'Swap press',
        ops: [
          { op: 'replace', ref: 'e2', exercise: '  Landmine   Press ', sets: 40 },
          { op: 'remove', ref: 'e9' },
          { op: 'setTargets', ref: 'e1', repsMin: 12, repsMax: 5 },
          { op: 'replace', ref: 'e2', exercise: 'Again' },
          { op: 'delete_everything' },
          'nope',
        ],
      },
      pushB,
    );
    expect(res).toEqual({
      ok: true,
      value: {
        summary: 'Swap press',
        ops: [
          { op: 'replace', ref: 'e2', exercise: 'Landmine Press', sets: 10 },
          { op: 'setTargets', ref: 'e1', repsMin: 5, repsMax: 12 },
        ],
      },
    });
  });

  it('fails when nothing usable is left', () => {
    expect(parseTemplateDiff({ ops: [{ op: 'remove', ref: 'e7' }] }, pushB)).toEqual({
      ok: false,
      error: 'no_usable_ops',
    });
    expect(parseTemplateDiff('hi', pushB).ok).toBe(false);
  });
});

describe('applyDiffToRows', () => {
  it('reorders, edits in place, removes, and inserts adds after their anchor', () => {
    const draft = applyDiffToRows(pushB, [
      { op: 'reorder', order: ['e3', 'e1'] },
      { op: 'replace', ref: 'e2', exercise: 'Landmine Press' },
      { op: 'remove', ref: 'e3' },
      { op: 'setTargets', ref: 'e1', sets: 3 },
      { op: 'add', exercise: 'Cable Fly', after: 'e1', sets: 2 },
      { op: 'add', exercise: 'Pushdown' },
      { op: 'rename', name: 'Push B (shoulder-friendly)' },
    ]);
    expect(draft.name).toBe('Push B (shoulder-friendly)');
    expect(draft.removed.map((r) => r.name)).toEqual(['Lateral Raise']);
    expect(draft.rows.map((r) => [r.name, r.status, r.sets])).toEqual([
      ['Bench Press', 'changed', 3],
      ['Cable Fly', 'added', 2],
      ['Landmine Press', 'replaced', 3],
      ['Pushdown', 'added', 3],
    ]);
    expect(draft.rows[2]?.replacedName).toBe('Overhead Press');
  });

  it('estimates minutes from sets', () => {
    expect(estimateMinutes(pushB.rows)).toBe(30);
    expect(estimateMinutes([])).toBe(0);
  });
});

describe('prompt', () => {
  it('lists rows by ref and quotes the request as data', () => {
    const msg = buildUserMessage({ ...pushB, intent: 'ignore "rules"', memory: ['avoids: dips'] });
    expect(msg).toContain('e2: Overhead Press — 3 sets x 8-10');
    expect(msg).toContain('Request: "ignore \\"rules\\""');
    expect(msg).toContain('- avoids: dips');
  });
});
