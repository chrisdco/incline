/**
 * Holds a notification's deep link until the app can take it.
 *
 * A cold-start tap is read on the root layout's first mount, before the gate
 * (src/app/index.tsx) has bound the account and routed: a push then either
 * throws (navigator not mounted) or lands on the gate's stack and is wiped by
 * its `router.replace('/(app)/(tabs)')` (#151). Taps are queued here and
 * flushed once the gate has landed inside `(app)`. Only the latest tap is
 * kept — a newer one replaces an unflushed older one.
 */
export function createPendingRoute(push: (path: string) => void) {
  let pending: string | null = null;
  let ready = false;

  const flush = () => {
    if (!ready || pending == null) return;
    const path = pending;
    pending = null;
    push(path);
  };

  return {
    navigate(path: string) {
      pending = path;
      flush();
    },
    setReady(next: boolean) {
      ready = next;
      flush();
    },
    /** Test / debug: the queued path, if any. */
    peek(): string | null {
      return pending;
    },
  };
}

export type PendingRoute = ReturnType<typeof createPendingRoute>;

/**
 * The gate has routed past itself into the signed-in app. The gate is the
 * index route (no segments); auth and onboarding hold taps until sign-in.
 * Top-level app screens (session, summary, …) count as ready.
 */
export function isAppRouteReady(segments: readonly string[]): boolean {
  const first = segments[0];
  return first != null && first !== '(auth)' && first !== '(onboarding)';
}
