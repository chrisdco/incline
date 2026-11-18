/**
 * Ask memory facts (AI-CHAT §5): real queries against the real schema.
 * Pins dedupe, confirm-on-restate, the cap, soft delete + undo and that
 * every write rides the outbox.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDbHandle } from './sqlite-adapter';

vi.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `mem-uuid-${++n}`, CryptoDigestAlgorithm: { SHA256: 'SHA256' }, digestStringAsync: async () => 'x' };
});

let currentDb: TestDbHandle | null = null;
vi.mock('../client', () => ({
  openDatabase: async () => currentDb!,
  openWriterDatabase: async () => currentDb!,
  isDatabaseReady: () => currentDb != null,
  __resetDatabaseCacheForTests: () => {},
}));

import { MEMORY_MAX_FACTS } from '@/contracts/ai/memory';
import {
  clearMemoryFacts,
  forgetMemoryFact,
  listMemoryFacts,
  restoreMemoryFact,
  saveMemoryFact,
  updateMemoryFact,
} from '../queries/memory';

let closeDb = () => {};
beforeEach(() => {
  closeDb();
  const t = createTestDatabase({ failOn: null });
  currentDb = t.db;
  closeDb = t.close;
});
afterEach(() => {
  closeDb();
  currentDb = null;
});

const outbox = async () =>
  (await currentDb!.getAllAsync<{ table_name: string }>("SELECT table_name FROM sync_outbox WHERE table_name = 'coach_memory'")).length;

describe('coach memory', () => {
  it('saves a stated fact as confirmed and enqueues it', async () => {
    const r = await saveMemoryFact({ kind: 'constraint', text: '  Left knee:\nno deep squats ', source: 'chat', status: 'confirmed' });
    expect(r.status).toBe('saved');
    const facts = await listMemoryFacts();
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ kind: 'constraint', text: 'Left knee: no deep squats', status: 'confirmed' });
    expect(await outbox()).toBeGreaterThan(0);
  });

  it('does not duplicate the same wording, and restating confirms a suggestion', async () => {
    await saveMemoryFact({ kind: 'goal', text: 'Bench 100 kg', source: 'extraction', status: 'suggested' });
    const again = await saveMemoryFact({ kind: 'goal', text: 'bench 100kg!', source: 'chat', status: 'confirmed' });
    // "100 kg" vs "100kg" differ in spacing → separate facts; exact restatement merges:
    expect(again.status).toBe('saved');
    const same = await saveMemoryFact({ kind: 'goal', text: 'Bench 100 kg.', source: 'chat', status: 'confirmed' });
    expect(same.status).toBe('saved');
    const facts = await listMemoryFacts();
    expect(facts.filter((f) => f.text.toLowerCase().startsWith('bench 100 kg'))).toHaveLength(1);
    expect(facts.find((f) => f.text === 'Bench 100 kg')?.status).toBe('confirmed');
  });

  it('refuses past the cap and ignores empty text', async () => {
    for (let i = 0; i < MEMORY_MAX_FACTS; i++) {
      await saveMemoryFact({ kind: 'other', text: `fact ${i}`, source: 'user', status: 'confirmed' });
    }
    expect((await saveMemoryFact({ kind: 'other', text: 'one more', source: 'user', status: 'confirmed' })).status).toBe('full');
    expect((await saveMemoryFact({ kind: 'other', text: '   ', source: 'user', status: 'confirmed' })).status).toBe('empty');
  });

  it('editing confirms; forget and clear are undoable', async () => {
    const r = await saveMemoryFact({ kind: 'preference', text: 'Likes dumbells', source: 'extraction', status: 'suggested' });
    if (r.status !== 'saved') throw new Error('not saved');
    await updateMemoryFact(r.fact.id, { text: 'Likes dumbbells' });
    expect((await listMemoryFacts())[0]).toMatchObject({ text: 'Likes dumbbells', status: 'confirmed' });

    await forgetMemoryFact(r.fact.id);
    expect(await listMemoryFacts()).toHaveLength(0);
    await restoreMemoryFact(r.fact.id);
    expect(await listMemoryFacts()).toHaveLength(1);

    const cleared = await clearMemoryFacts();
    expect(cleared).toEqual([r.fact.id]);
    expect(await listMemoryFacts()).toHaveLength(0);
  });
});
