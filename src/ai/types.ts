/**
 * AI layer contracts (docs/decisions/AI-ARCHITECTURE.md). These are the stable
 * seams: tasks describe *what* (schema, prompt, validator, fallback), providers
 * describe *who* answers, the router decides *which* and owns failure. Nothing
 * here writes app data — outputs are validated values for the caller to
 * propose / apply through `mutate()`.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ProviderCapabilities {
  structuredOutput: boolean;
  toolCalling: boolean;
  /** Works with no network (Expo AI, llama.rn). */
  onDevice: boolean;
}

/** Why a task fell back. Order of `FAILURE_PRIORITY` decides what the UI says. */
export type AiFailure =
  | 'disabled'
  /** No consent to send data to this provider (App Store 5.1.2(i)). */
  | 'consent'
  | 'offline'
  | 'rate_limited'
  | 'timeout'
  | 'invalid_output'
  | 'unavailable'
  | 'cancelled'
  | 'error';

export class AiError extends Error {
  constructor(
    readonly kind: AiFailure,
    message: string,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export type ParseResult<O> = { ok: true; output: O } | { ok: false; error: string };

/** Server-side execution of a task through the Incline gateway (edge function). */
export interface GatewaySpec<I> {
  /** Edge function name: 'ai-task' (body carries the task id). */
  fn: string;
  body(input: I): Promise<unknown> | unknown;
  /** Pull the task output out of the gateway's JSON response (null = not ok). */
  pick(json: unknown): unknown;
}

export interface AiTask<I, O> {
  id: string;
  promptVersion: string;
  /** Model size this needs; the router skips providers below it once tiers exist. */
  tier: 'small' | 'medium' | 'large';
  needs?: Partial<Pick<ProviderCapabilities, 'structuredOutput' | 'toolCalling'>>;
  /** Per provider attempt. Keep the gym loop's budget in mind. */
  timeoutMs: number;
  /** Messages for chat providers (BYOK, local, on-device). Output must be JSON. */
  buildMessages(input: I): ChatMessage[];
  /** JSON Schema of the output, sent as `json_schema` to providers that constrain decoding. */
  outputSchema?: Record<string, unknown>;
  gateway?: GatewaySpec<I>;
  /** Sanitize + validate untrusted model output. Never invents content. */
  parse(raw: unknown, input: I): ParseResult<O>;
  /** Deterministic stand-in (rules copy) or null when the surface should hide. */
  fallback(input: I): O | null;
  /** Stable key for cache + in-flight dedupe; omit to never cache. */
  cacheKey?(input: I): Promise<string> | string;
  /**
   * Where the cached entry lives (e.g. user + surface). One entry per slot,
   * overwritten when the key changes, so the cache stays bounded even when
   * the key is a content hash. Defaults to the key itself.
   */
  cacheSlot?(input: I): string;
}

export interface RunContext {
  signal?: AbortSignal;
  /** Set on the second attempt after `parse` rejected the first. */
  repairHint?: string;
}

export interface AiProvider {
  id: string;
  capabilities: ProviderCapabilities;
  /** Whether a rejected parse is worth one retry with a repair hint. */
  repairable: boolean;
  /** Cheap readiness check (key present, model downloaded…). */
  isAvailable(): Promise<boolean>;
  /** Can this provider execute this task at all (e.g. gateway needs `task.gateway`)? */
  supports(task: AiTask<unknown, unknown>): boolean;
  /** Raw, untrusted output (parsed JSON). Throws AiError. */
  run<I>(task: AiTask<I, unknown>, input: I, ctx: RunContext): Promise<unknown>;
}

export interface AiAttempt {
  providerId: string;
  outcome: 'ok' | AiFailure;
  latencyMs: number;
  detail?: string;
}

export type AiResult<O> =
  | { status: 'ok'; output: O; providerId: string; cached: boolean; attempts: AiAttempt[] }
  | { status: 'fallback'; reason: AiFailure; output: O | null; attempts: AiAttempt[] };

/** Metadata only — never prompt or output content (privacy rule). */
export interface AiEvent {
  taskId: string;
  promptVersion: string;
  status: 'ok' | 'fallback';
  reason?: AiFailure;
  providerId?: string;
  cached: boolean;
  attempts: AiAttempt[];
}

export interface KvLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}
