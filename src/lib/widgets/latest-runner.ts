/**
 * Serialize async work and coalesce bursts to the latest input.
 *
 * Widget refreshes are fired from many write sites. Dropping a call simply
 * because an earlier read is still in flight leaves the widget one state
 * behind (start a workout during a foreground refresh and it can stay on
 * READY). Keep one run at a time, but remember only the newest queued value:
 * older intermediate snapshots are already obsolete by the time they would run.
 *
 * `run` owns its error handling; a rejected run rejects the returned promise.
 */
export function createLatestRunner<T>(run: (value: T) => Promise<void>): (value: T) => Promise<void> {
  let running = false;
  let pending: { value: T } | null = null;

  function takePending(): { value: T } | null {
    const queued = pending;
    pending = null;
    return queued;
  }

  async function drain(value: T): Promise<void> {
    running = true;
    let current = value;
    try {
      for (;;) {
        await run(current);
        const next = takePending();
        if (!next) break;
        current = next.value;
      }
    } finally {
      running = false;
    }

    // A call can land after the loop's last check but before `running` is
    // cleared. Hand it off here instead of leaving it queued forever.
    const trailing = takePending();
    if (trailing) await drain(trailing.value);
  }

  return (value: T): Promise<void> => {
    if (running) {
      pending = { value };
      return Promise.resolve();
    }
    return drain(value);
  };
}
