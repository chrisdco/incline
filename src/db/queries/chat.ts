import { CHAT_PARTS_VERSION, textOf, upgradeParts, type ChatMessageRecord, type ChatPart, type ChatRole } from '@/contracts/ai/chat';
import { newUuid } from '@/lib/uuid';

import { openDatabase } from '../client';
import { mutate } from '../write';

/**
 * Ask chat threads (AI-CHAT §4, migration 023). Device-local: nothing here
 * enqueues sync. Parts are stored as our own ChatPart JSON with `v`.
 */
const CHAT_TABLES = ['chat_threads', 'chat_messages'] as const;

/** Threads shown in the Ask list. Older ones stay until deleted. */
export const MAX_LISTED_THREADS = 50;
export const MAX_TITLE = 60;

export interface ChatThread {
  uuid: string;
  title: string;
  contextKind: string | null;
  contextId: string | null;
  memoryOff: boolean;
  createdAt: number;
  updatedAt: number;
}

interface ThreadRow {
  uuid: string;
  title: string;
  context_kind: string | null;
  context_id: string | null;
  memory_off: number;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  uuid: string;
  role: string;
  parts_json: string;
  v: number;
  model: string | null;
  provider: string | null;
  prompt_version: string | null;
  created_at: number;
}

function mapThread(r: ThreadRow): ChatThread {
  return {
    uuid: r.uuid,
    title: r.title,
    contextKind: r.context_kind,
    contextId: r.context_id,
    memoryOff: r.memory_off === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapMessageRow(r: MessageRow): ChatMessageRecord {
  let raw: unknown = [];
  try {
    raw = JSON.parse(r.parts_json);
  } catch {
    // A corrupt row renders empty rather than breaking the thread.
  }
  const role: ChatRole = r.role === 'user' || r.role === 'system' ? r.role : 'assistant';
  return {
    id: r.uuid,
    role,
    parts: upgradeParts(raw, r.v),
    v: r.v,
    createdAt: r.created_at,
    ...(r.model ? { model: r.model } : {}),
    ...(r.provider ? { provider: r.provider } : {}),
    ...(r.prompt_version ? { promptVersion: r.prompt_version } : {}),
  };
}

/** First line of the question, trimmed to fit a row. */
export function threadTitleFrom(text: string): string {
  const line = text.trim().split('\n')[0]!.replace(/\s+/g, ' ').trim();
  return line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE - 1)}…` : line;
}

export async function listChatThreads(limit = MAX_LISTED_THREADS): Promise<ChatThread[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<ThreadRow>(
    `SELECT uuid, title, context_kind, context_id, memory_off, created_at, updated_at
       FROM chat_threads WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`,
    limit,
  );
  return rows.map(mapThread);
}

export async function getChatThread(uuid: string): Promise<ChatThread | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<ThreadRow>(
    `SELECT uuid, title, context_kind, context_id, memory_off, created_at, updated_at
       FROM chat_threads WHERE uuid = ? AND deleted_at IS NULL`,
    uuid,
  );
  return row ? mapThread(row) : null;
}

export async function getChatMessages(threadUuid: string): Promise<ChatMessageRecord[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<MessageRow>(
    `SELECT uuid, role, parts_json, v, model, provider, prompt_version, created_at
       FROM chat_messages WHERE thread_uuid = ? ORDER BY created_at, id`,
    threadUuid,
  );
  return rows.map(mapMessageRow);
}

export interface NewChatMessage {
  role: ChatRole;
  parts: readonly ChatPart[];
  model?: string;
  provider?: string;
  promptVersion?: string;
}

/**
 * Appends messages to a thread, creating it (titled from the first user
 * message) when `threadUuid` is new. One transaction; returns the thread uuid.
 */
export async function appendChatMessages(
  threadUuid: string,
  messages: readonly NewChatMessage[],
  opts: { now?: number; context?: { kind: string; id: string } } = {},
): Promise<string> {
  const now = opts.now ?? Date.now();
  await mutate(CHAT_TABLES, async (tx) => {
    const exists = await tx.getFirstAsync<{ uuid: string }>(`SELECT uuid FROM chat_threads WHERE uuid = ?`, threadUuid);
    if (!exists) {
      const firstUser = messages.find((m) => m.role === 'user');
      const title = threadTitleFrom(firstUser ? firstUser.parts.map((p) => (p.type === 'text' ? p.text : '')).join('') : '') || 'New chat';
      await tx.runAsync(
        `INSERT INTO chat_threads (uuid, title, context_kind, context_id, memory_off, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)`,
        threadUuid,
        title,
        opts.context?.kind ?? null,
        opts.context?.id ?? null,
        now,
        now,
      );
    } else {
      await tx.runAsync(`UPDATE chat_threads SET updated_at = ?, deleted_at = NULL WHERE uuid = ?`, now, threadUuid);
    }
    // Same timestamp for a batch; insertion order (id) keeps them in sequence.
    for (const m of messages) {
      await tx.runAsync(
        `INSERT INTO chat_messages (uuid, thread_uuid, role, parts_json, v, model, provider, prompt_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        newUuid(),
        threadUuid,
        m.role,
        JSON.stringify(m.parts),
        CHAT_PARTS_VERSION,
        m.model ?? null,
        m.provider ?? null,
        m.promptVersion ?? null,
        now,
      );
    }
  });
  return threadUuid;
}

/** Deletes the thread and its messages (local only, nothing to sync yet). */
export async function deleteChatThread(uuid: string): Promise<void> {
  await mutate(CHAT_TABLES, async (tx) => {
    await tx.runAsync(`DELETE FROM chat_messages WHERE thread_uuid = ?`, uuid);
    await tx.runAsync(`DELETE FROM chat_threads WHERE uuid = ?`, uuid);
  });
}

/** Renames a thread from the thread menu. Empty input falls back to "Chat". */
export async function renameChatThread(uuid: string, title: string): Promise<void> {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) || 'Chat';
  await mutate(CHAT_TABLES, async (tx) => {
    await tx.runAsync(`UPDATE chat_threads SET title = ? WHERE uuid = ? AND deleted_at IS NULL`, clean, uuid);
  });
}

/** Rows scanned per search; plenty for device-local chats, bounded for old phones. */
const SEARCH_SCAN = 300;

/**
 * Threads whose messages mention `query` (drawer search). One query: SQLite
 * narrows by LIKE over the stored JSON, then the visible text is checked so
 * JSON keys and tool payloads don't match. Newest messages first.
 */
export async function searchChatThreadUuids(query: string, open = openDatabase): Promise<string[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const like = `%${q.replace(/[\%_]/g, (c) => `\${c}`)}%`;
  const db = await open();
  const rows = await db.getAllAsync<{ thread_uuid: string; parts_json: string; v: number }>(
    `SELECT m.thread_uuid, m.parts_json, m.v FROM chat_messages m
       JOIN chat_threads t ON t.uuid = m.thread_uuid AND t.deleted_at IS NULL
       WHERE lower(m.parts_json) LIKE ? ESCAPE '\'
       ORDER BY m.created_at DESC LIMIT ?`,
    like,
    SEARCH_SCAN,
  );
  const out = new Set<string>();
  for (const r of rows) {
    if (out.has(r.thread_uuid)) continue;
    try {
      const parts = upgradeParts(JSON.parse(r.parts_json), r.v);
      if (textOf(parts).toLowerCase().includes(q)) out.add(r.thread_uuid);
    } catch {
      // A row we can't parse just doesn't match.
    }
  }
  return [...out];
}
