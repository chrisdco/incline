import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AiDataCategory } from '@/contracts/ai/data-use';
import { kvStorage } from '@/db/kv';

import { byokPreset, type ByokPresetId } from './byok-presets';
import type { AiEvent, AiFailure } from './types';

/**
 * "AI data use" (FOUNDATION-REVIEW G9): one local entry per request that left
 * the device — when, which task, which provider and model, which kinds of
 * data (categories, never the payload) and token counts. Answers "what did you
 * send, and to whom?" and doubles as on-device AI observability.
 *
 * Device-local, bounded (newest MAX_ENTRIES), cleared with AI settings and on
 * sign-out (kv `ai.*`). Chat will write the same shape per model turn.
 */
export interface AiDataUseEntry {
  /** ms epoch */
  at: number;
  task: string;
  /** Router provider id: `gateway`, `byok:groq`… */
  providerId: string;
  model?: string;
  categories: readonly AiDataCategory[];
  inputTokens?: number;
  outputTokens?: number;
  outcome: 'ok' | AiFailure;
}

export const MAX_ENTRIES = 200;

/** User-facing names for task ids; unknown ids (future tasks, chat) show as-is. */
export const AI_TASK_LABEL: Record<string, string> = {
  narrate: 'Coach notes',
  plan_build: 'Build a plan',
  plan_edit: 'Edit a plan',
  template_edit: 'Edit a routine',
  chat: 'Ask',
};

export function dataUseTaskLabel(task: string): string {
  return AI_TASK_LABEL[task] ?? task;
}

/** `gateway` → Incline AI, `byok:groq` → Groq (your key). */
export function dataUseProviderLabel(providerId: string): string {
  if (providerId === 'gateway') return 'Incline AI';
  if (providerId.startsWith('byok:')) return `${byokPreset(providerId.slice(5) as ByokPresetId).label} (your key)`;
  return providerId;
}

/** Outcomes where nothing reached the provider. */
const NOT_SENT: ReadonlySet<string> = new Set(['unavailable', 'disabled', 'consent', 'offline']);

/** One entry per attempt that actually sent a request. Cache hits send nothing. */
export function entriesFromEvent(event: AiEvent, now = Date.now()): AiDataUseEntry[] {
  if (event.cached) return [];
  return event.attempts
    .filter((a) => a.providerId !== 'router' && a.providerId !== 'cache' && !NOT_SENT.has(a.outcome))
    .map((a) => ({
      at: now,
      task: event.taskId,
      providerId: a.providerId,
      model: a.model,
      categories: event.dataCategories,
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      outcome: a.outcome,
    }));
}

/** Newest first, bounded. */
export function appendEntries(existing: readonly AiDataUseEntry[], added: readonly AiDataUseEntry[]): AiDataUseEntry[] {
  if (!added.length) return existing as AiDataUseEntry[];
  return [...added.slice().reverse(), ...existing].slice(0, MAX_ENTRIES);
}

export interface AiDataUseSummary {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  providers: string[];
  since: number | null;
}

export function summarizeDataUse(entries: readonly AiDataUseEntry[]): AiDataUseSummary {
  const providers = new Set<string>();
  let inputTokens = 0;
  let outputTokens = 0;
  for (const e of entries) {
    providers.add(e.providerId);
    inputTokens += e.inputTokens ?? 0;
    outputTokens += e.outputTokens ?? 0;
  }
  return {
    requests: entries.length,
    inputTokens,
    outputTokens,
    providers: [...providers],
    since: entries.length ? entries[entries.length - 1]!.at : null,
  };
}

/** Portable export: JSON the user can keep or hand to support. */
export function exportDataUse(entries: readonly AiDataUseEntry[]): string {
  return JSON.stringify(
    {
      format: 'incline.ai-data-use',
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: entries.map((e) => ({ ...e, at: new Date(e.at).toISOString() })),
    },
    null,
    2,
  );
}

interface DataUseStore {
  entries: AiDataUseEntry[];
  record: (event: AiEvent) => void;
  clear: () => void;
}

export const useAiDataUse = create<DataUseStore>()(
  persist(
    (set) => ({
      entries: [],
      record: (event) => {
        const added = entriesFromEvent(event);
        if (added.length) set((s) => ({ entries: appendEntries(s.entries, added) }));
      },
      clear: () => set({ entries: [] }),
    }),
    {
      name: 'ai.data-use',
      version: 1,
      storage: createJSONStorage(() => kvStorage),
      partialize: (s) => ({ entries: s.entries }),
      merge: (persisted, cur) => {
        const raw = (persisted as { entries?: unknown } | null)?.entries;
        const entries = Array.isArray(raw)
          ? (raw.filter(
              (e) => e && typeof e === 'object' && typeof e.at === 'number' && typeof e.task === 'string' && Array.isArray(e.categories),
            ) as AiDataUseEntry[]).slice(0, MAX_ENTRIES)
          : [];
        return { ...cur, entries };
      },
    },
  ),
);
