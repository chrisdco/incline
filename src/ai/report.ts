import type { AiEvent } from './types';

/**
 * The one `onEvent` for AI tasks: records "AI data use" (G9) and reports
 * fallbacks worth fixing (bad output, bugs) — not offline / quota / signed-out.
 * Metadata only (task, reason, providers, categories), never prompt or output
 * text. Never throws.
 */
export async function reportAiEvent(event: AiEvent): Promise<void> {
  try {
    const { useAiDataUse } = await import('./data-use');
    useAiDataUse.getState().record(event);
  } catch {
    // The record is best-effort; a storage hiccup must not surface.
  }
  if (event.status === 'ok' || (event.reason !== 'invalid_output' && event.reason !== 'error')) return;
  const { captureError } = await import('@/lib/error-sink');
  captureError(new Error(`ai.${event.taskId} fallback: ${event.reason}`), {
    where: `ai.${event.taskId}`,
    attempts: event.attempts.map((a) => `${a.providerId}:${a.outcome}`).join(','),
  });
}
