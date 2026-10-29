/**
 * Where caught background errors go (#138).
 *
 * Data-layer code (sync, outbox, photo queue) reports here instead of
 * importing `monitoring.ts` directly: Sentry's native module can't load in
 * the vitest/Node test runtime, and the data layer must stay testable.
 * `initMonitoring()` points the sink at `reportError`; until then (and in
 * tests) errors still reach the console — never swallowed.
 */
export type ErrorContext = Record<string, string | number | boolean>;

type Sink = (error: unknown, context?: ErrorContext) => void;

let sink: Sink | null = null;

export function setErrorSink(next: Sink | null): void {
  sink = next;
}

/** Log and forward a caught error. `context.where` names the failing job. */
export function captureError(error: unknown, context: ErrorContext & { where: string }): void {
  console.warn(`[${context.where}]`, error);
  try {
    sink?.(error, context);
  } catch {
    // Reporting must never throw into the caller's recovery path.
  }
}
