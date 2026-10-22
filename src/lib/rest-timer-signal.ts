/**
 * One-shot bridge from a notification action ("+1 min") to whichever rest
 * timer is mounted.
 *
 * The action is handled in the root layout while the timer lives on the
 * session screen — and on a cold start that screen does not exist yet. The
 * request therefore waits in a module slot until a timer subscribes, so the
 * app opens with a rest already running instead of a silent no-op.
 */
export interface RestRequest {
  seconds: number;
  /** Set by the notification payload; the timer ignores requests for other sessions. */
  sessionId?: number;
}

let pending: RestRequest | null = null;
const listeners = new Set<(request: RestRequest) => void>();

export function signalRestRequest(request: RestRequest): void {
  if (listeners.size === 0) {
    // Cold start: no session screen yet, so hold it until one mounts. When a
    // timer is already live the request is delivered synchronously instead —
    // parking it too would replay it on the next mount.
    pending = request;
    return;
  }
  for (const listener of listeners) listener(request);
}

/**
 * Take the pending request, if any. Requests addressed to another session stay
 * parked so the screen they belong to can pick them up.
 */
export function consumeRestRequest(sessionId?: number): RestRequest | null {
  if (!pending) return null;
  if (pending.sessionId != null && sessionId != null && pending.sessionId !== sessionId) {
    return null;
  }
  const request = pending;
  pending = null;
  return request;
}

export function subscribeRestRequest(listener: (request: RestRequest) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
