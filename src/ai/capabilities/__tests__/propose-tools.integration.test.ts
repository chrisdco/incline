/**
 * Propose tools never write: they check the target on SQLite and return a
 * proposal the loop turns into a card. Only proposal-kind tools with a
 * `toPart` may emit parts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDbHandle } from '@/db/__tests__/sqlite-adapter';
import type { ChatEvent, ModelPort } from '@/contracts/ai/chat';
import { findTool } from '@/contracts/ai/chat-tools';

vi.mock('@/db/client', () => ({ openDatabase: async () => currentDb }));
vi.mock('@/lib/uuid', () => ({ newUuid: () => 'p1' }));

import { runChatTurn, type ToolImpl } from '../../runtime/loop';
import { readLines, sourcesFor } from '../../chat-turn';
import { deviceProposeTools, parseRoutineChange, ROUTINE_CHANGE_ACTION } from '../propose-tools';

let currentDb: TestDbHandle | null = null;
const tool = () => deviceProposeTools()[0]!;

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

function scripted(steps: ChatEvent[][]): ModelPort {
  return {
    id: 'fake',
    providerId: 'fake',
    model: 'fake-1',
    supportsTools: true,
    async *stream() {
      for (const ev of steps.shift() ?? []) yield ev;
    },
  };
}

const call = (name: string, args: Record<string, string>): ChatEvent[][] => [
  [
    { type: 'tool_call_end', id: 'c1', name, args },
    { type: 'step_end', step: 0, finish: 'tool_calls' },
  ],
  [
    { type: 'text_delta', delta: 'Here is a suggestion.' },
    { type: 'step_end', step: 1, finish: 'stop' },
  ],
];

describe('propose_routine_change', () => {
  beforeEach(async () => {
    currentDb = createTestDatabase().db;
    await currentDb.runAsync(`INSERT INTO workout_templates (id, name, description, estimated_minutes, is_custom, created_at, updated_at) VALUES (10, 'Push A', '', 50, 1, 0, 0)`);
    await currentDb.runAsync(`INSERT INTO workout_templates (id, name, description, estimated_minutes, is_custom, created_at, updated_at) VALUES (11, 'Starter', '', 40, 0, 0, 0)`);
  });

  it('proposes a change to their own routine without writing anything', async () => {
    const before = await currentDb!.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM template_exercises');
    const out = await tool().run({ routine_id: '10', change: '  Swap bench for   incline dumbbell press ' }, {});
    expect(out).toMatchObject({ status: 'proposed', proposal_id: 'p1', routine: 'Push A', routine_id: '10', change: 'Swap bench for incline dumbbell press' });
    expect(await currentDb!.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM template_exercises')).toEqual(before);
    expect(tool().toPart!(out)).toEqual({
      type: 'proposal',
      action: ROUTINE_CHANGE_ACTION,
      proposalId: 'p1',
      summary: 'Swap bench for incline dumbbell press',
      payload: { templateId: 10, routineName: 'Push A', change: 'Swap bench for incline dumbbell press' },
      status: 'pending',
    });
  });

  it('rejects built-in, missing and malformed routines', async () => {
    await expect(tool().run({ routine_id: '11', change: 'x' }, {})).rejects.toThrow(/not found/);
    await expect(tool().run({ routine_id: '99', change: 'x' }, {})).rejects.toThrow(/not found/);
    await expect(tool().run({ routine_id: '10; drop', change: 'x' }, {})).rejects.toThrow(/routine_id/);
    await expect(tool().run({ routine_id: '10', change: '   ' }, {})).rejects.toThrow(/change/);
  });

  it('parses only well-formed payloads', () => {
    expect(parseRoutineChange({ templateId: 10, routineName: 'Push A', change: 'Add face pulls' })).toEqual({ templateId: 10, routineName: 'Push A', change: 'Add face pulls' });
    expect(parseRoutineChange({ templateId: '10', routineName: 'Push A', change: 'x' })).toBe(null);
    expect(parseRoutineChange({ templateId: 0, routineName: 'Push A', change: 'x' })).toBe(null);
    expect(parseRoutineChange({ templateId: 10, routineName: 'Push A', change: '' })).toBe(null);
    expect(parseRoutineChange(undefined)).toBe(null);
  });

  it('the loop turns a proposal into a card part, kept out of sources and read lines', async () => {
    const events = await collect(runChatTurn({ runId: 'r', model: scripted(call('propose_routine_change', { routine_id: '10', change: 'Add face pulls' })), system: 's', history: [], user: 'u', tools: deviceProposeTools() }));
    const parts = events.flatMap((e) => (e.type === 'part' ? [e.part] : []));
    expect(parts).toContainEqual(expect.objectContaining({ type: 'proposal', proposalId: 'p1', summary: 'Add face pulls' }));
    const result = { type: 'tool_result' as const, callId: 'c1', name: 'propose_routine_change', result: { routine: 'Push A' }, isError: false };
    expect(sourcesFor([result])).toEqual([]);
    expect(readLines([result])).toEqual([]);
  });

  it('a propose-kind tool without toPart is refused', async () => {
    const bare: ToolImpl = { spec: findTool('propose_routine_change')!, run: async () => ({ ok: true }) };
    const events = await collect(runChatTurn({ runId: 'r', model: scripted(call('propose_routine_change', { routine_id: '10', change: 'x' })), system: 's', history: [], user: 'u', tools: [bare] }));
    expect(events.find((e) => e.type === 'tool_result')).toMatchObject({ isError: true });
    expect(events.some((e) => e.type === 'part' && e.part.type === 'proposal')).toBe(false);
  });
});
