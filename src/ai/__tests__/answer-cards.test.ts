import { describe, expect, it } from 'vitest';

import type { ChatPart, Json } from '@/contracts/ai/chat';

import { answerCardsFor } from '../chat-turn';

const result = (name: string, value: Json, isError = false): ChatPart => ({ type: 'tool_result', callId: name, name, result: value, isError });

describe('answerCardsFor (T1 catalog cards)', () => {
  it('builds each card from the tool result, in read order', () => {
    const parts: ChatPart[] = [
      { type: 'text', text: 'Your bench is 200 kg' }, // the model's number never reaches a card
      result('get_personal_records', {
        unit: 'kg',
        records: [
          { exercise: 'Deadlift', estimated_1rm: 180 },
          { exercise: 'Squat', estimated_1rm: 150 },
          { exercise: 'Plank', estimated_1rm: null },
          { exercise: 'Bench Press', estimated_1rm: 100 },
          { exercise: 'Row', estimated_1rm: 90 },
        ],
      }),
      result('get_training_summary', {
        weeks: 4,
        sets_per_muscle_per_week: { chest: { average: 12 }, back: { average: 14.5 }, calves: { average: 0 } },
      }),
      result('list_workouts', {
        unit: 'kg',
        workouts: [{ id: '7', name: 'Push', date: '2026-11-10T08:00:00.000Z', minutes: 52, completed_sets: 18, volume: 5400 }],
      }),
    ];
    expect(answerCardsFor(parts)).toEqual([
      {
        kind: 'records',
        unit: 'kg',
        rows: [
          { exercise: 'Deadlift', value: 180 },
          { exercise: 'Squat', value: 150 },
          { exercise: 'Bench Press', value: 100 },
        ],
      },
      {
        kind: 'muscles',
        weeks: 4,
        rows: [
          { muscle: 'back', average: 14.5 },
          { muscle: 'chest', average: 12 },
        ],
      },
      { kind: 'workouts', unit: 'kg', rows: [{ id: '7', name: 'Push', date: '2026-11-10T08:00:00.000Z', minutes: 52, sets: 18 }] },
    ]);
  });

  it('keeps one card per kind but a trend per lift', () => {
    const hist = (exercise: string) =>
      result('get_exercise_history', { exercise, unit: 'kg', sessions: [{ estimated_1rm: 100 }, { estimated_1rm: 95 }] });
    const recs = result('get_personal_records', { unit: 'kg', records: [{ exercise: 'Squat', estimated_1rm: 150 }] });
    const cards = answerCardsFor([hist('Bench Press'), hist('Squat'), recs, recs]);
    expect(cards.map((c) => c.kind)).toEqual(['trend', 'trend', 'records']);
    expect(cards[0]).toEqual({ kind: 'trend', exercise: 'Bench Press', unit: 'kg', points: [95, 100] });
  });

  it('draws nothing from errored or empty reads', () => {
    expect(
      answerCardsFor([
        result('get_personal_records', { unit: 'kg', records: [{ exercise: 'Squat', estimated_1rm: 150 }] }, true),
        result('get_training_summary', { weeks: 4, sets_per_muscle_per_week: {} }),
        result('list_workouts', { unit: 'kg', workouts: [] }),
        result('get_profile', { unit: 'kg' }),
      ]),
    ).toEqual([]);
  });
});
