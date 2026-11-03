import type { AiFailure } from './types';

/**
 * User-facing AI copy in one place (AI-ARCHITECTURE "Consistency": one tone,
 * one set of failure messages). Friendly, short, no blame, always a way on.
 */
export const AI_FAILURE_COPY: Record<AiFailure, { title: string; body: string }> = {
  disabled: { title: 'AI is off', body: 'Turn it on in Settings → AI to get coaching in plain words.' },
  offline: { title: "You're offline", body: 'Everything else still works. AI will be back when you reconnect.' },
  rate_limited: { title: 'AI is resting for now', body: 'The free limit was reached. Try again in a minute, or add your own key.' },
  timeout: { title: 'That took too long', body: 'The AI service is slow right now. Try again in a moment.' },
  invalid_output: { title: "Couldn't put that together", body: 'The reply did not pass our checks, so we kept the standard text.' },
  unavailable: { title: "Can't reach AI", body: 'Check the key, model or address and try again.' },
  cancelled: { title: 'Cancelled', body: '' },
  error: { title: 'Something went wrong', body: 'Try again in a moment.' },
};

export function aiFailureCopy(reason: AiFailure): { title: string; body: string } {
  return AI_FAILURE_COPY[reason] ?? AI_FAILURE_COPY.error;
}
