/**
 * Ask threads on the real schema (migration 023) and the pure turn helpers:
 * thread create/append/list/delete, history shaping, sources and the data
 * categories a turn records.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDbHandle } from '@/db/__tests__/sqlite-adapter';

vi.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `uuid-${++n}`, CryptoDigestAlgorithm: { SHA256: 'SHA256' }, digestStringAsync: async () => 'x' };
});

let currentDb: TestDbHandle | null = null;
vi.mock('@/db/client', () => ({
  openDatabase: async () => currentDb,
  openWriterDatabase: async () => currentDb,
  isDatabaseReady: () => true,
}));

import type { ChatMessageRecord, ChatPart } from '@/contracts/ai/chat';
import { appendChatMessages, deleteChatThread, getChatMessages, listChatThreads, threadTitleFrom } from '@/db/queries/chat';

import { buildChatSystem, categoriesFor, followUpsFor, historyFor, outcomeOf, readLines, sourcesFor, trendCardsFor } from '../chat-turn';

const text = (t: string): ChatPart => ({ type: 'text', text: t });

describe('chat threads', () => {
  beforeEach(() => {
    currentDb = createTestDatabase().db;
  });

  it('creates a thread titled from the question and keeps message order', async () => {
    await appendChatMessages('t1', [{ role: 'user', parts: [text("How's my bench going?\nmore")] }], { now: 1000 });
    await appendChatMessages(
      't1',
      [
        { role: 'user', parts: [text('And squat?')] },
        { role: 'assistant', parts: [text('Up 5 kg.'), { type: 'source', kind: 'tool', label: 'Back Squat history' }], model: 'm', provider: 'gateway', promptVersion: 'chat-1' },
      ],
      { now: 2000 },
    );
    const threads = await listChatThreads();
    expect(threads).toMatchObject([{ uuid: 't1', title: "How's my bench going?", updatedAt: 2000 }]);
    const msgs = await getChatMessages('t1');
    expect(msgs.map((m) => m.role)).toEqual(['user', 'user', 'assistant']);
    expect(msgs[2]).toMatchObject({ model: 'm', provider: 'gateway', promptVersion: 'chat-1', v: 1 });
    expect(msgs[2]!.parts[1]).toMatchObject({ type: 'source', label: 'Back Squat history' });
  });

  it('lists newest first and deletes a thread with its messages', async () => {
    await appendChatMessages('a', [{ role: 'user', parts: [text('a')] }], { now: 1 });
    await appendChatMessages('b', [{ role: 'user', parts: [text('b')] }], { now: 2 });
    expect((await listChatThreads()).map((t) => t.uuid)).toEqual(['b', 'a']);
    await deleteChatThread('b');
    expect((await listChatThreads()).map((t) => t.uuid)).toEqual(['a']);
    expect(await getChatMessages('b')).toEqual([]);
  });

  it('drops unknown part types from a newer app instead of crashing', async () => {
    await currentDb!.runAsync(
      `INSERT INTO chat_messages (uuid, thread_uuid, role, parts_json, v, created_at) VALUES ('m', 'x', 'assistant', ?, 2, 0)`,
      JSON.stringify([{ type: 'hologram' }, { type: 'text', text: 'hi' }]),
    );
    expect((await getChatMessages('x'))[0]!.parts).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('titles are one trimmed line', () => {
    expect(threadTitleFrom('  a   b \nc')).toBe('a b');
    expect(threadTitleFrom('x'.repeat(80))).toHaveLength(60);
  });
});

describe('chat turn helpers', () => {
  const rec = (role: ChatMessageRecord['role'], parts: ChatPart[]): ChatMessageRecord => ({ id: 'i', role, parts, v: 1, createdAt: 0 });

  it('history keeps text only and the last N', () => {
    const msgs = [
      rec('user', [text('q1')]),
      rec('assistant', [{ type: 'tool_call', id: 'c', name: 'get_profile', args: {} }, text('a1')]),
      rec('assistant', [{ type: 'notice', level: 'error', code: 'offline', text: 'x' }]),
      rec('user', [text('q2')]),
    ];
    expect(historyFor(msgs)).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ]);
    expect(historyFor(msgs, 1)).toEqual([{ role: 'user', content: 'q2' }]);
  });

  it('sources name each successful read once; categories follow the tools used', () => {
    const parts: ChatPart[] = [
      { type: 'tool_call', id: '1', name: 'get_exercise_history', args: { exercise: 'bench' } },
      { type: 'tool_result', callId: '1', name: 'get_exercise_history', result: { exercise: 'Bench Press', sessions: [] } },
      { type: 'tool_call', id: '2', name: 'get_exercise_history', args: { exercise: 'bench' } },
      { type: 'tool_result', callId: '2', name: 'get_exercise_history', result: { exercise: 'Bench Press', sessions: [] } },
      { type: 'tool_call', id: '3', name: 'get_routine', args: {} },
      { type: 'tool_result', callId: '3', name: 'get_routine', result: { error: 'routine_id is required' }, isError: true },
    ];
    expect(sourcesFor(parts).map((s) => s.label)).toEqual(['Bench Press history']);
    const cats = categoriesFor(parts);
    expect(cats).toEqual(expect.arrayContaining(['message', 'profile', 'workouts', 'routines']));
  });

  it('maps finishes to data-use outcomes and builds a dated prompt', () => {
    expect(outcomeOf('stop')).toBe('ok');
    expect(outcomeOf('step_cap')).toBe('ok');
    expect(outcomeOf('cancelled')).toBe('cancelled');
    expect(outcomeOf('error', 'rate_limited')).toBe('rate_limited');
    expect(outcomeOf('error')).toBe('error');
    const sys = buildChatSystem({ today: '2026-11-12', unit: 'kg', goal: 'strength' });
    expect(sys).toContain('Today is 2026-11-12');
    expect(sys).toContain('goal: strength');
  });
});

describe('thread extras from tool results', () => {
  const hist: ChatPart = {
    type: 'tool_result',
    callId: '1',
    name: 'get_exercise_history',
    result: {
      exercise: 'Bench Press',
      unit: 'kg',
      sessions: [
        { date: 'c', estimated_1rm: 97 },
        { date: 'b', estimated_1rm: 95 },
        { date: 'a', estimated_1rm: 92 },
      ],
    },
  };

  it('says what it read, draws the trend oldest-first from our numbers, offers follow-ups', () => {
    expect(readLines([hist])).toEqual(['Looked at 3 Bench Press sessions']);
    expect(trendCardsFor([hist])).toEqual([{ exercise: 'Bench Press', unit: 'kg', points: [92, 95, 97] }]);
    expect(followUpsFor([hist])).toEqual(['What should I aim for next on Bench Press?', 'When should I deload?']);
  });

  it('ignores errored reads', () => {
    const err: ChatPart = { ...hist, isError: true } as ChatPart;
    expect(readLines([err])).toEqual([]);
    expect(trendCardsFor([err])).toEqual([]);
  });
});
