import type { ChatErrorCode, ChatMessageRecord, ChatPart, Json, ModelMessage, RunFinish, SourcePart } from '@/contracts/ai/chat';
import { findTool } from '@/contracts/ai/chat-tools';
import { textOf } from '@/contracts/ai/chat';
import type { AiDataCategory } from '@/contracts/ai/data-use';

import type { AiFailure } from './types';

/**
 * Pure pieces of one Ask turn: the system prompt, the history the model sees,
 * the sources shown under an answer and what goes in "AI data use". Kept out
 * of the hook so they're unit-tested and shared by future surfaces.
 */
export const CHAT_PROMPT_VERSION = 'chat-1';
/** Earlier messages sent with a turn. Tool results are not replayed; the model can read again. */
export const HISTORY_MESSAGES = 12;

export interface ChatPromptContext {
  /** ISO date (yyyy-mm-dd) in the user's time zone. */
  today: string;
  unit: 'kg' | 'lb';
  goal?: string | null;
  experience?: string | null;
}

export function buildChatSystem(ctx: ChatPromptContext): string {
  return [
    "You answer questions about the user's own strength training in the Incline app.",
    `Today is ${ctx.today}. Show weights in ${ctx.unit}.`,
    ctx.goal ? `Their goal: ${ctx.goal}.` : '',
    ctx.experience ? `Experience: ${ctx.experience}.` : '',
    'Use the tools to read their logged data before answering anything about it; never guess numbers.',
    'If the data is not there, say so plainly.',
    'Answer in a few short sentences or a short list. Lead with the answer, then the numbers that back it.',
    'You cannot change their routines or logs here; if they ask, say what you would change and that they can apply it from the routine.',
    'Stay on training, recovery and the app. Politely decline anything else.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Stored messages → what the model sees: user and assistant text only, last N. */
export function historyFor(messages: readonly ChatMessageRecord[], limit = HISTORY_MESSAGES): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    const text = textOf(m.parts).trim();
    if (!text) continue;
    out.push(m.role === 'user' ? { role: 'user', content: text } : { role: 'assistant', content: text });
  }
  return out.slice(-limit);
}

function str(v: Json | undefined): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** "Bench Press history" / "Your records": one chip per distinct read that succeeded. */
export function sourceLabel(name: string, result: Json): string {
  const r = result && typeof result === 'object' && !Array.isArray(result) ? (result as Record<string, Json>) : {};
  switch (name) {
    case 'get_exercise_history':
      return `${str(r.exercise) ?? 'Exercise'} history`;
    case 'get_personal_records':
      return 'Your records';
    case 'get_training_summary':
      return 'Sets per muscle';
    case 'list_workouts':
      return 'Recent workouts';
    case 'get_workout':
      return str(r.name) ?? 'A workout';
    case 'list_routines':
      return 'Your routines';
    case 'get_routine':
      return str(r.name) ?? 'A routine';
    case 'get_profile':
      return 'Your profile';
    case 'search_exercises':
      return 'Exercise library';
    default:
      return name;
  }
}

export function sourcesFor(parts: readonly ChatPart[]): SourcePart[] {
  const seen = new Set<string>();
  const out: SourcePart[] = [];
  for (const p of parts) {
    if (p.type !== 'tool_result' || p.isError) continue;
    const label = sourceLabel(p.name, p.result);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ type: 'source', kind: 'tool', label, ref: p.name });
  }
  return out;
}

/** What left the device: the question, the prompt's profile bits and whatever the tools read. */
export function categoriesFor(parts: readonly ChatPart[]): AiDataCategory[] {
  const cats = new Set<AiDataCategory>(['message', 'profile']);
  for (const p of parts) {
    if (p.type !== 'tool_call') continue;
    for (const c of findTool(p.name)?.dataCategories ?? []) cats.add(c);
  }
  return [...cats];
}

const CODE_TO_FAILURE: Partial<Record<ChatErrorCode, AiFailure>> = {
  disabled: 'disabled',
  consent: 'consent',
  offline: 'offline',
  rate_limited: 'rate_limited',
  timeout: 'timeout',
  bad_response: 'invalid_output',
  unavailable: 'unavailable',
  cancelled: 'cancelled',
};

export function outcomeOf(finish: RunFinish, code?: ChatErrorCode): 'ok' | AiFailure {
  if (finish === 'stop' || finish === 'step_cap') return 'ok';
  if (finish === 'cancelled') return 'cancelled';
  return (code && CODE_TO_FAILURE[code]) ?? 'error';
}

/** User-facing line for a turn that failed before any answer. */
export function chatErrorText(code: ChatErrorCode | 'consent' | 'unavailable' | 'disabled' | 'off'): string {
  switch (code) {
    case 'offline':
      return "You're offline. Your question is saved; try again when you're connected.";
    case 'rate_limited':
      return "You've reached today's limit for Ask. It resets tomorrow.";
    case 'timeout':
      return 'That took too long. Try again.';
    case 'consent':
      return 'Allow an AI provider in AI settings to use Ask.';
    case 'off':
      return 'Turn on AI features in AI settings to use Ask.';
    case 'disabled':
      return 'Ask is turned off right now. Try again later.';
    case 'unavailable':
      return 'Sign in, or add your own AI key in AI settings, to use Ask.';
    default:
      return "Couldn't get an answer. Try again.";
  }
}
