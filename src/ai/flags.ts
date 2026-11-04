import { aiActorFlag, aiTaskFlag, isFlagDisabled } from '@/contracts/ai/flags';
import { kvStorage } from '@/db/kv';

/**
 * Remote AI kill switches (AI-PLATFORM §5). Supabase `ai_flags` holds the
 * disabled keys; the app fetches them once per open and caches them in kv, so
 * a switch reaches every device within one app open and works offline after.
 * A failed fetch keeps the last known set; nothing here ever blocks the UI.
 */
const KV_KEY = 'ai.flags';

let memory: Set<string> | null = null;

async function disabledSet(): Promise<Set<string>> {
  if (memory) return memory;
  try {
    const raw = await kvStorage.getItem(KV_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    memory = new Set(Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []);
  } catch {
    memory = new Set();
  }
  return memory;
}

export async function isAiTaskEnabled(taskId: string): Promise<boolean> {
  return !isFlagDisabled(await disabledSet(), aiTaskFlag(taskId));
}

export async function isAiActorEnabled(actor: string): Promise<boolean> {
  return !isFlagDisabled(await disabledSet(), aiActorFlag(actor));
}

export interface RefreshAiFlagsOptions {
  supabaseUrl: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
}

/** Fetch disabled keys (public, read-only table). Returns false when it couldn't refresh. */
export async function refreshAiFlags(opts: RefreshAiFlagsOptions): Promise<boolean> {
  if (!opts.supabaseUrl || !opts.anonKey) return false;
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${opts.supabaseUrl}/rest/v1/ai_flags?select=key&disabled=eq.true`, {
      headers: { apikey: opts.anonKey, Authorization: `Bearer ${opts.anonKey}` },
    });
    if (!res.ok) return false;
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) return false;
    const keys = rows
      .map((r) => (r && typeof r === 'object' ? (r as { key?: unknown }).key : null))
      .filter((k): k is string => typeof k === 'string');
    memory = new Set(keys);
    await kvStorage.setItem(KV_KEY, JSON.stringify(keys));
    return true;
  } catch {
    return false;
  }
}

export function __resetAiFlagsForTests(): void {
  memory = null;
}
