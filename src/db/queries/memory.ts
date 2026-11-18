import type { MemoryFact, MemoryKind } from '@/contracts/ai/chat';
import { asMemoryKind, cleanMemoryText, MEMORY_MAX_FACTS, sameMemoryText } from '@/contracts/ai/memory';
import { openDatabase } from '@/db/client';
import { mutate, type Tx } from '@/db/write';
import { newUuid } from '@/lib/uuid';
import { enqueueSync } from '@/sync/outbox';

/**
 * Ask memory facts (AI-CHAT §5), synced via the outbox. Rules and prompt
 * shape live in `src/contracts/ai/memory.ts`.
 */

interface MemoryRow {
  uuid: string;
  kind: string;
  text: string;
  source: string;
  source_ref: string | null;
  confidence: number;
  status: string;
  created_at: number;
  last_used_at: number | null;
  expires_at: number | null;
  updated_at: number;
  deleted_at: number | null;
}

const SOURCES = new Set<MemoryFact['source']>(['user', 'chat', 'extraction', 'feedback']);

function mapFact(r: MemoryRow): MemoryFact {
  return {
    id: r.uuid,
    kind: asMemoryKind(r.kind),
    text: r.text,
    source: SOURCES.has(r.source as MemoryFact['source']) ? (r.source as MemoryFact['source']) : 'user',
    sourceRef: r.source_ref ?? undefined,
    confidence: r.confidence,
    status: r.status === 'confirmed' ? 'confirmed' : 'suggested',
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at ?? undefined,
    expiresAt: r.expires_at ?? undefined,
  };
}

async function enqueueFact(tx: Tx, uuid: string): Promise<void> {
  const r = await tx.getFirstAsync<MemoryRow>('SELECT * FROM coach_memory WHERE uuid = ?', uuid);
  if (!r) return;
  await enqueueSync(
    'coach_memory',
    uuid,
    'upsert',
    {
      kind: r.kind,
      text: r.text,
      source: r.source,
      source_ref: r.source_ref,
      confidence: r.confidence,
      status: r.status,
      created_at: r.created_at,
      last_used_at: r.last_used_at,
      expires_at: r.expires_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at,
    },
    tx,
  );
}

/** Every live fact, newest first. Tens of rows; one query. */
export async function listMemoryFacts(): Promise<MemoryFact[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<MemoryRow>(
    'SELECT * FROM coach_memory WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?',
    MEMORY_MAX_FACTS * 2,
  );
  return rows.map(mapFact);
}

export type SaveFactResult = { status: 'saved' | 'exists'; fact: MemoryFact } | { status: 'full' | 'empty' };

/**
 * Save a fact. `confirmed` for facts the user stated ("remember I…") or
 * typed; `suggested` for inferred ones. A fact with the same wording is
 * not duplicated (a suggestion the user restates becomes confirmed).
 */
export async function saveMemoryFact(input: {
  kind: MemoryKind;
  text: string;
  source: MemoryFact['source'];
  status: MemoryFact['status'];
  sourceRef?: string | null;
  confidence?: number;
  expiresAt?: number | null;
}): Promise<SaveFactResult> {
  const text = cleanMemoryText(input.text);
  if (!text) return { status: 'empty' };
  return mutate(['coach_memory'], async (tx) => {
    const live = await tx.getAllAsync<MemoryRow>('SELECT * FROM coach_memory WHERE deleted_at IS NULL');
    const dup = live.find((r) => sameMemoryText(r.text, text));
    const now = Date.now();
    if (dup) {
      if (input.status === 'confirmed' && dup.status !== 'confirmed') {
        await tx.runAsync('UPDATE coach_memory SET status = ?, updated_at = ? WHERE uuid = ?', 'confirmed', now, dup.uuid);
        await enqueueFact(tx, dup.uuid);
        return { status: 'saved', fact: mapFact({ ...dup, status: 'confirmed', updated_at: now }) };
      }
      return { status: 'exists', fact: mapFact(dup) };
    }
    if (live.length >= MEMORY_MAX_FACTS) return { status: 'full' };
    const uuid = newUuid();
    await tx.runAsync(
      `INSERT INTO coach_memory (uuid, kind, text, source, source_ref, confidence, status, created_at, expires_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      uuid,
      input.kind,
      text,
      input.source,
      input.sourceRef ?? null,
      Math.min(1, Math.max(0, input.confidence ?? 1)),
      input.status,
      now,
      input.expiresAt ?? null,
      now,
    );
    await enqueueFact(tx, uuid);
    const row = await tx.getFirstAsync<MemoryRow>('SELECT * FROM coach_memory WHERE uuid = ?', uuid);
    return { status: 'saved', fact: mapFact(row!) };
  });
}

/** Edit text/kind, or confirm a suggestion. Editing a fact confirms it. */
export async function updateMemoryFact(
  uuid: string,
  patch: { text?: string; kind?: MemoryKind; status?: MemoryFact['status'] },
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (patch.text != null) {
    const text = cleanMemoryText(patch.text);
    if (!text) return;
    sets.push('text = ?');
    args.push(text);
  }
  if (patch.kind) {
    sets.push('kind = ?');
    args.push(patch.kind);
  }
  const status = patch.status ?? (patch.text != null || patch.kind ? 'confirmed' : undefined);
  if (status) {
    sets.push('status = ?');
    args.push(status);
  }
  if (sets.length === 0) return;
  await mutate(['coach_memory'], async (tx) => {
    await tx.runAsync(`UPDATE coach_memory SET ${sets.join(', ')}, updated_at = ? WHERE uuid = ?`, ...args, Date.now(), uuid);
    await enqueueFact(tx, uuid);
  });
}

/** Soft delete (synced). Undo restores it. */
export async function forgetMemoryFact(uuid: string): Promise<void> {
  await setDeleted([uuid], Date.now());
}

export async function restoreMemoryFact(uuid: string): Promise<void> {
  await setDeleted([uuid], null);
}

/** "Clear all": every live fact. Returns the uuids for undo. */
export async function clearMemoryFacts(): Promise<string[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<{ uuid: string }>('SELECT uuid FROM coach_memory WHERE deleted_at IS NULL');
  const ids = rows.map((r) => r.uuid);
  if (ids.length) await setDeleted(ids, Date.now());
  return ids;
}

async function setDeleted(uuids: string[], at: number | null): Promise<void> {
  if (uuids.length === 0) return;
  await mutate(['coach_memory'], async (tx) => {
    const now = Date.now();
    const marks = uuids.map(() => '?').join(', ');
    await tx.runAsync(`UPDATE coach_memory SET deleted_at = ?, updated_at = ? WHERE uuid IN (${marks})`, at, now, ...uuids);
    for (const u of uuids) await enqueueFact(tx, u);
  });
}

/**
 * Stamp facts a reply was built with (decay, AI-CHAT §5). Not synced on its
 * own: the next real edit carries it.
 */
export async function touchMemoryFacts(uuids: string[]): Promise<void> {
  if (uuids.length === 0) return;
  const marks = uuids.map(() => '?').join(', ');
  await mutate(['coach_memory'], (tx) =>
    tx.runAsync(`UPDATE coach_memory SET last_used_at = ? WHERE uuid IN (${marks})`, Date.now(), ...uuids).then(() => undefined),
  );
}
