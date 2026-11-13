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

const obj = (v: Json): Record<string, Json> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>) : {});
const arr = (v: Json): Json[] => (Array.isArray(v) ? v : []);
const num = (v: Json | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** "Looked at 6 Bench Press sessions": what the answer read, said once, after the fact. */
export function readLines(parts: readonly ChatPart[]): string[] {
  const seen = new Set<string>();
  for (const p of parts) {
    if (p.type !== 'tool_result' || p.isError) continue;
    const r = obj(p.result);
    let line: string;
    switch (p.name) {
      case 'get_exercise_history':
        line = `Looked at ${arr(r.sessions).length} ${str(r.exercise) ?? 'exercise'} sessions`;
        break;
      case 'get_personal_records':
        line = `Looked at your records`;
        break;
      case 'get_training_summary':
        line = `Looked at ${typeof r.weeks === 'number' ? r.weeks : 'recent'} weeks of sets`;
        break;
      case 'list_workouts':
        line = `Looked at ${arr(r.workouts).length} workouts`;
        break;
      default:
        line = `Looked at ${sourceLabel(p.name, p.result).toLowerCase()}`;
    }
    seen.add(line);
  }
  return [...seen];
}

/**
 * The e1RM trend from an exercise-history read, oldest first: the numbers
 * come from our tool result, never from the model's text (ASK-UI.md T1).
 */
export interface TrendCard {
  exercise: string;
  unit: string;
  points: number[];
}

export function trendCardsFor(parts: readonly ChatPart[]): TrendCard[] {
  const out = new Map<string, TrendCard>();
  for (const p of parts) {
    if (p.type !== 'tool_result' || p.isError || p.name !== 'get_exercise_history') continue;
    const r = obj(p.result);
    const exercise = str(r.exercise);
    const points = arr(r.sessions)
      .map((s) => obj(s).estimated_1rm)
      .filter((v): v is number => typeof v === 'number')
      .reverse();
    if (exercise && points.length >= 2) out.set(exercise, { exercise, unit: str(r.unit) ?? '', points });
  }
  return [...out.values()];
}

/** Rows a card shows at most: a glance, not a table (the answer has the rest). */
const CARD_ROWS = { records: 3, muscles: 6, workouts: 3 } as const;

/**
 * T1 catalog cards (ASK-UI.md): what an answer read, drawn by us. Each is
 * built by rules from a tool result (device SQLite), so every number on a
 * card is ours, never the model's. One card per read kind; trends per lift.
 */
export type AnswerCard =
  | ({ kind: 'trend' } & TrendCard)
  | { kind: 'records'; unit: string; rows: { exercise: string; value: number }[] }
  | { kind: 'muscles'; weeks: number; rows: { muscle: string; average: number }[] }
  | { kind: 'workouts'; unit: string; rows: { id: string; name: string; date: string; minutes: number; sets: number }[] };

export function answerCardsFor(parts: readonly ChatPart[]): AnswerCard[] {
  const cards: AnswerCard[] = [];
  const kinds = new Set<AnswerCard['kind']>();
  const add = (c: AnswerCard) => {
    if (c.kind !== 'trend' && kinds.has(c.kind)) return;
    kinds.add(c.kind);
    cards.push(c);
  };
  for (const p of parts) {
    if (p.type !== 'tool_result' || p.isError) continue;
    const r = obj(p.result);
    if (p.name === 'get_exercise_history') {
      for (const t of trendCardsFor([p])) add({ kind: 'trend', ...t });
    } else if (p.name === 'get_personal_records') {
      const rows = arr(r.records)
        .map(obj)
        .flatMap((x) => (str(x.exercise) && typeof x.estimated_1rm === 'number' && x.estimated_1rm > 0 ? [{ exercise: str(x.exercise)!, value: x.estimated_1rm }] : []))
        .slice(0, CARD_ROWS.records);
      if (rows.length) add({ kind: 'records', unit: str(r.unit) ?? '', rows });
    } else if (p.name === 'get_training_summary') {
      const rows = Object.entries(obj(r.sets_per_muscle_per_week))
        .flatMap(([muscle, v]) => {
          const average = obj(v).average;
          return typeof average === 'number' && average > 0 ? [{ muscle, average }] : [];
        })
        .sort((a, b) => b.average - a.average)
        .slice(0, CARD_ROWS.muscles);
      if (rows.length) add({ kind: 'muscles', weeks: typeof r.weeks === 'number' ? r.weeks : 4, rows });
    } else if (p.name === 'list_workouts') {
      const rows = arr(r.workouts)
        .map(obj)
        .flatMap((w) =>
          str(w.id) && str(w.date)
            ? [{ id: str(w.id)!, name: str(w.name) || 'Workout', date: str(w.date)!, minutes: num(w.minutes), sets: num(w.completed_sets) }]
            : [],
        )
        .slice(0, CARD_ROWS.workouts);
      if (rows.length) add({ kind: 'workouts', unit: str(r.unit) ?? '', rows });
    }
  }
  return cards;
}

/** Two follow-ups from what the answer read: tappable next questions, by rules. */
export function followUpsFor(parts: readonly ChatPart[]): string[] {
  const out: string[] = [];
  for (const p of parts) {
    if (p.type !== 'tool_result' || p.isError) continue;
    const r = obj(p.result);
    if (p.name === 'get_exercise_history' && str(r.exercise)) {
      out.push(`What should I aim for next on ${str(r.exercise)}?`, 'When should I deload?');
    } else if (p.name === 'get_personal_records') {
      out.push('Which lift is improving fastest?');
    } else if (p.name === 'get_training_summary') {
      out.push('Which muscles am I undertraining?', 'How should I split my week?');
    } else if (p.name === 'list_workouts') {
      out.push('How consistent have I been?');
    }
  }
  return [...new Set(out)].slice(0, 2);
}
