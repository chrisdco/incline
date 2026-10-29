/**
 * Fire-and-forget local writes that feed the outbox (#138).
 *
 * Most writes are awaited inside `mutate()` and surface their own errors.
 * The few that can't be (store subscriptions, other callbacks with no caller
 * to throw to) go through here: retried a few times when the task is safe to
 * repeat, then reported via the error sink and `sync_status.lastError` —
 * never swallowed.
 */
import { captureError } from '@/lib/error-sink';

import { setSyncStatus } from './state';

export const BACKGROUND_WRITE_ERROR = 'A change could not be queued for sync — editing it again retries';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `task` (which must be idempotent) up to `attempts` times. Resolves
 * true on success, false once every attempt failed and the failure was
 * reported. Never rejects.
 */
export async function runBackgroundWrite(
  where: string,
  task: () => Promise<void>,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<boolean> {
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 250;
  for (let attempt = 1; ; attempt++) {
    try {
      await task();
      return true;
    } catch (err) {
      if (attempt < attempts) {
        await sleep(delayMs * attempt);
        continue;
      }
      captureError(err, { where, attempts: attempt });
      try {
        await setSyncStatus({ status: 'error', lastError: BACKGROUND_WRITE_ERROR });
      } catch (statusErr) {
        captureError(statusErr, { where: `${where}.status` });
      }
      return false;
    }
  }
}
