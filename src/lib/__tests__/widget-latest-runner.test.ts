import { describe, expect, it, vi } from 'vitest';

import { createLatestRunner } from '@/lib/widgets/latest-runner';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createLatestRunner', () => {
  it('coalesces a burst to the newest value instead of dropping it', async () => {
    const gate = deferred<void>();
    const seen: number[] = [];
    let first = true;

    const runner = createLatestRunner(async (value: number) => {
      seen.push(value);
      if (first) {
        first = false;
        await gate.promise;
      }
    });

    const firstRun = runner(1);
    const secondRun = runner(2);
    const thirdRun = runner(3);

    expect(seen).toEqual([1]);

    gate.resolve();
    await Promise.all([firstRun, secondRun, thirdRun]);

    // 2 was superseded while 1 was in flight; 3 is the only queued value.
    expect(seen).toEqual([1, 3]);
  });

  it('runs again after the runner goes idle', async () => {
    const run = vi.fn(async (_value: number) => {});
    const runner = createLatestRunner(run);

    await runner(1);
    await runner(2);

    expect(run.mock.calls).toEqual([[1], [2]]);
  });
});
