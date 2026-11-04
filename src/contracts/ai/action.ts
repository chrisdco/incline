/**
 * A typed change an AI proposes (AI-PLATFORM §3). The same shape travels from
 * the in-app AI, the web, MCP clients and recipes; every host validates
 * `payload` with the action's own parser before anything is written.
 */
export interface AiActionRef<P = unknown> {
  /** Registered action type, e.g. `template.apply_diff`. */
  type: string;
  payload: P;
}

const ACTION_TYPE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/** `domain.verb` style, lowercase. Keeps types stable across hosts and logs. */
export function isAiActionType(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && ACTION_TYPE_RE.test(value);
}
