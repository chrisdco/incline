/**
 * Run `task` unless a previous run is still in flight (`flag.current`), and
 * clear the flag once it settles. Lives outside components because React
 * Compiler can't compile a `try/finally` inside one.
 */
export async function runExclusive(
  flag: { current: boolean },
  task: () => Promise<void>,
): Promise<void> {
  if (flag.current) return;
  flag.current = true;
  try {
    await task();
  } finally {
    flag.current = false;
  }
}
