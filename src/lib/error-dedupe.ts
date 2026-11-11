/**
 * One report per distinct error (#191): the error boundary can catch the same
 * render failure on every "Try again", and Sentry should see it once.
 */
const reported = new Set<string>();

export function errorSignature(error: unknown): string {
  if (error instanceof Error) {
    const frame = error.stack?.split('\n').find((l) => l.trim().startsWith('at ')) ?? '';
    return `${error.name}:${error.message}:${frame.trim()}`;
  }
  return `non-error:${String(error)}`;
}

/** True the first time a signature is seen; later calls are duplicates. */
export function shouldReport(error: unknown, seen: Set<string> = reported): boolean {
  const sig = errorSignature(error);
  if (seen.has(sig)) return false;
  seen.add(sig);
  return true;
}
