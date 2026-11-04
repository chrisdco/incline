import type { DbTable, Tx } from '@/db/write';

import type { ParseResult } from './types';

/**
 * Action registry (AI-PLATFORM §3): every AI-originated write is a registered
 * action — parse the untrusted payload, apply it on the `mutate()` transaction,
 * and optionally revert it from the stored before/after. Hosts (in-app AI,
 * web, MCP, recipes) only ever name a type + payload; the logic lives here.
 */
export interface AiActionDef<P = unknown, B = unknown, A = unknown> {
  /** `domain.verb`, e.g. `template.apply_diff`. Also the `ai_activity.kind`. */
  type: string;
  /** Tables `apply` and `revert` write (emitted as changed after COMMIT). */
  tables: readonly DbTable[];
  /** Validate the payload; it may come from a model or an external client. */
  parse(payload: unknown): ParseResult<P>;
  /** Write the change; return what it replaced, what it wrote, and a log line. */
  apply(tx: Tx, payload: P): Promise<{ before: B; after: A; summary: string }>;
  /** Put `before` back. Omit when a change can't be undone (it's still logged). */
  revert?(tx: Tx, before: B, after: A): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous registry; callers get typed defs
const actions = new Map<string, AiActionDef<any, any, any>>();

/** Re-registering a type replaces it (Fast Refresh re-runs modules). */
export function registerAiAction<P, B, A>(def: AiActionDef<P, B, A>): void {
  actions.set(def.type, def);
}

export function getAiAction(type: string): AiActionDef | undefined {
  return actions.get(type);
}

export function canRevert(type: string): boolean {
  return Boolean(actions.get(type)?.revert);
}
