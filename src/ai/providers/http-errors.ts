import { AiError } from '../types';

/** Map a fetch failure to the router's vocabulary. */
export function aiErrorFromFetch(err: unknown, signal?: AbortSignal): AiError {
  if (err instanceof AiError) return err;
  if (signal?.aborted) return new AiError('cancelled', 'request cancelled');
  const name = (err as { name?: string } | null)?.name;
  if (name === 'AbortError' || name === 'TimeoutError') return new AiError('timeout', 'request timed out');
  // RN and browsers surface "no network" as a TypeError from fetch.
  if (err instanceof TypeError) return new AiError('offline', err.message);
  return new AiError('error', err instanceof Error ? err.message : String(err));
}

export function aiErrorFromStatus(status: number, body: string): AiError {
  if (status === 429) return new AiError('rate_limited', body.slice(0, 200));
  if (status === 401 || status === 403 || status === 404) return new AiError('unavailable', `HTTP ${status}`);
  if (status === 502 && body.includes('invalid_model_output')) return new AiError('invalid_output', body.slice(0, 200));
  // ai-task kill switch: same meaning as the local switch.
  if (status === 503 && body.includes('"disabled"')) return new AiError('disabled', 'switched off remotely');
  return new AiError('error', `HTTP ${status}: ${body.slice(0, 200)}`);
}
