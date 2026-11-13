/**
 * Chat contracts we own (docs/decisions/AI-CHAT.md §3A.2). Libraries, wire
 * formats and UI kits translate to and from these; nothing stores or renders a
 * library's internal shape. Pure TS, shared with Deno (ai-chat, incline-mcp).
 *
 * Versioning: stored messages carry `v`. Additive changes (a new part type, an
 * optional field) keep the version; anything that changes meaning bumps it,
 * and readers upgrade old rows lazily (`upgradeParts`).
 */
import type { AiDataCategory, AiUsage } from './data-use';

export const CHAT_PARTS_VERSION = 1;

/** Serializable JSON (tool args and results cross the wire and the database). */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// ---------------------------------------------------------------- parts

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ToolCallPart {
  type: 'tool_call';
  /** Provider-issued id; pairs the call with its result. */
  id: string;
  name: string;
  args: Json;
}

export interface ToolResultPart {
  type: 'tool_result';
  callId: string;
  name: string;
  /** What the model saw. Kept so a thread can be explained later. */
  result: Json;
  isError?: boolean;
}

/** What "Ask about this" attached: a pointer the model resolves with its read tools, never data. */
export type AboutKind = 'exercise' | 'workout' | 'routine' | 'insight';
export const ABOUT_KINDS: readonly AboutKind[] = ['exercise', 'workout', 'routine', 'insight'];

export interface ContextPart {
  type: 'context';
  kind: AboutKind;
  /** Display name, also what the model is told ("Bench Press"). */
  label: string;
  /** Our id for the thing (workout log id, exercise id), for opening it later. */
  ref?: string;
}

/** A structured card the UI renders natively (PR list, trend, workout). */
export interface DataCardPart {
  type: 'data_card';
  card: string;
  data: Json;
}

/** A proposed change; applied only by the user, via the action registry. */
export interface ProposalPart {
  type: 'proposal';
  /** Registered action kind (src/ai/actions). */
  action: string;
  proposalId: string;
  summary: string;
  payload: Json;
  status?: 'pending' | 'applied' | 'dismissed' | 'reverted';
}

/** Where an answer came from: a tool read, a memory fact, a screen. */
export interface SourcePart {
  type: 'source';
  kind: 'tool' | 'memory' | 'context';
  label: string;
  ref?: string;
}

/** Follow-up chips (at most 3). */
export interface ActionsPart {
  type: 'actions';
  actions: { label: string; prompt: string }[];
}

/** System-side notes in the thread: step cap hit, fell back, offline. */
export interface NoticePart {
  type: 'notice';
  level: 'info' | 'warning' | 'error';
  code: string;
  text: string;
}

export type ChatPart =
  | TextPart
  | ContextPart
  | ToolCallPart
  | ToolResultPart
  | DataCardPart
  | ProposalPart
  | SourcePart
  | ActionsPart
  | NoticePart;

export type ChatRole = 'system' | 'user' | 'assistant';

/** A message as stored (chat_messages.parts_json) and rendered. */
export interface ChatMessageRecord {
  id: string;
  role: ChatRole;
  parts: ChatPart[];
  v: number;
  createdAt: number;
  /** Assistant messages: who answered and with which prompt, for explainability and evals. */
  model?: string;
  provider?: string;
  promptVersion?: string;
}

const PART_TYPES: ReadonlySet<string> = new Set([
  'text',
  'context',
  'tool_call',
  'tool_result',
  'data_card',
  'proposal',
  'source',
  'actions',
  'notice',
]);

/**
 * Reads stored parts of any known version. Unknown part types from a newer
 * app are dropped rather than crashing an older reader.
 */
export function upgradeParts(raw: unknown, _v: number): ChatPart[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p): p is ChatPart => Boolean(p) && typeof p === 'object' && PART_TYPES.has((p as { type?: unknown }).type as string),
  );
}

export function textOf(parts: readonly ChatPart[]): string {
  return parts
    .filter((p): p is TextPart => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

// ---------------------------------------------------------------- events

/**
 * Streamed run events, named after the AG-UI event set so an AG-UI transport
 * is a mapping, not a redesign.
 */
export type ChatEvent =
  | { type: 'run_start'; runId: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_args'; id: string; delta: string }
  | { type: 'tool_call_end'; id: string; name: string; args: Json }
  | { type: 'tool_result'; callId: string; name: string; result: Json; isError?: boolean }
  /** A whole part the runtime produced (card, proposal, source, notice). */
  | { type: 'part'; part: ChatPart }
  | { type: 'step_end'; step: number; finish: FinishReason; usage?: AiUsage }
  | { type: 'run_end'; finish: RunFinish; usage?: AiUsage }
  | { type: 'error'; code: ChatErrorCode; message: string };

export type FinishReason = 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'error' | 'unknown';
export type RunFinish = 'stop' | 'step_cap' | 'cancelled' | 'error';
export type ChatErrorCode =
  | 'offline'
  | 'rate_limited'
  | 'timeout'
  | 'unavailable'
  | 'consent'
  | 'disabled'
  | 'bad_response'
  | 'cancelled'
  | 'error';

// ---------------------------------------------------------------- tools

export type ToolKind = 'read' | 'propose';
export type ChatSurface = 'chat' | 'session' | 'builder' | 'mcp';

/**
 * One tool, every surface. Exposed to models as OpenAI `tools`, to external
 * agents as MCP `tools/list`, and implemented once per data source (device
 * SQLite, server Supabase) with identical output.
 */
export interface ToolSpec {
  name: string;
  title: string;
  description: string;
  /** JSON Schema of the arguments. */
  inputSchema: Record<string, unknown>;
  kind: ToolKind;
  surfaces: readonly ChatSurface[];
  /** What the result carries, for the AI data use record and consent. */
  dataCategories: readonly AiDataCategory[];
  version: number;
}

/** OpenAI-compatible `tools` entry. */
export function toOpenAiTool(spec: ToolSpec): { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } } {
  return { type: 'function', function: { name: spec.name, description: spec.description, parameters: spec.inputSchema } };
}

// ---------------------------------------------------------------- ports

/** Message as a model sees it (OpenAI chat shape, the lingua franca of every provider we use). */
export type ModelMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: { id: string; name: string; args: string }[] }
  | { role: 'tool'; toolCallId: string; content: string };

export interface ModelRequest {
  messages: ModelMessage[];
  tools?: ToolSpec[];
  /** Upper bound on output tokens for this step. */
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/**
 * One model step, streamed. Adapters (OpenAI-compatible HTTP today, on-device
 * later) emit `text_delta`, `tool_call_*` and a final `step_end`; the runtime
 * loop owns tool execution and `run_*` events.
 */
export interface ModelPort {
  id: string;
  /** Provider label for records: `gateway`, `byok:groq`, `local`… */
  providerId: string;
  model: string;
  supportsTools: boolean;
  stream(req: ModelRequest): AsyncIterable<ChatEvent>;
}

// ---------------------------------------------------------------- memory

export type MemoryKind = 'preference' | 'constraint' | 'goal' | 'equipment' | 'schedule' | 'other';

export interface MemoryFact {
  id: string;
  kind: MemoryKind;
  text: string;
  source: 'user' | 'chat' | 'extraction' | 'feedback';
  sourceRef?: string;
  confidence: number;
  status: 'suggested' | 'confirmed';
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
}

/** Swappable memory store (SQLite facts today; local vectors or a service later). */
export interface MemoryPort {
  recall(query: { text?: string; limit: number; kinds?: MemoryKind[] }): Promise<MemoryFact[]>;
  propose(fact: Omit<MemoryFact, 'id' | 'createdAt' | 'status'>): Promise<MemoryFact>;
  apply(id: string): Promise<void>;
  forget(id: string): Promise<void>;
}
