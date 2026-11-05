import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));

import type { WorkoutTemplate } from '@/db/types';

import { buildTemplateProposal, templateEditInput } from '../template-edit-client';

function template(): WorkoutTemplate {
  const te = (id: number, exerciseId: number, name: string, sets: number) => ({
    id,
    templateId: 1,
    exerciseId,
    sortOrder: id,
    targetSets: sets,
    targetRepsMin: 8,
    targetRepsMax: 10,
    restSeconds: 90,
    notes: '',
    supersetGroup: null,
    exercise: { name } as never,
  });
  return {
    id: 1,
    name: 'Push B',
    description: '',
    category: 'strength',
    difficulty: 'intermediate',
    estimatedMinutes: 45,
    isCustom: true,
    createdAt: 0,
    updatedAt: 0,
    exercises: [te(11, 1, 'Bench Press', 4), te(12, 2, 'Overhead Press', 3)],
  };
}

describe('buildTemplateProposal', () => {
  it('keeps the original when a swap has no catalog match and leaves unknown adds out', () => {
    const t = template();
    const input = templateEditInput(t, 'swap it');
    const proposal = buildTemplateProposal(
      t,
      input,
      {
        summary: 'Swap',
        ops: [
          { op: 'replace', ref: 'e2', exercise: 'Zottman Thing' },
          { op: 'add', exercise: 'Cable Fly' },
          { op: 'add', exercise: 'Mystery Move' },
        ],
      },
      new Map([
        ['Zottman Thing', null],
        ['Cable Fly', { id: 5, name: 'Cable Fly (Standing)' }],
        ['Mystery Move', null],
      ]),
      'p1',
    );
    expect(proposal.unresolved).toEqual(['Zottman Thing', 'Mystery Move']);
    expect(proposal.rows.map((r) => [r.name, r.status])).toEqual([
      ['Bench Press', 'kept'],
      ['Overhead Press', 'kept'],
      ['Cable Fly (Standing)', 'added'],
    ]);
    expect(proposal.payload?.rows).toEqual([
      { id: 11, exerciseId: 1, sets: 4, repsMin: 8, repsMax: 10 },
      { id: 12, exerciseId: 2, sets: 3, repsMin: 8, repsMax: 10 },
      { exerciseId: 5, sets: 3, repsMin: 8, repsMax: 12 },
    ]);
  });

  it('has no payload when nothing would change', () => {
    const t = template();
    const input = templateEditInput(t, 'swap bench');
    const proposal = buildTemplateProposal(
      t,
      input,
      { summary: 'Swap', ops: [{ op: 'replace', ref: 'e1', exercise: 'Bench' }] },
      new Map([['Bench', { id: 1, name: 'Bench Press' }]]),
      'p2',
    );
    expect(proposal.payload).toBeNull();
  });
});
