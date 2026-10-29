/**
 * Ongoing rest notification — Android native builds.
 *
 * Mirrors `rest-timer-store`: posted/replaced when a rest starts or its
 * deadline / next set changes, cancelled when rest ends, is skipped, or the
 * session finishes or is discarded. The rest-complete alarm
 * (`src/lib/rest-notification.ts`) stays the alert; this is only the
 * in-progress display, on the low-importance `expo-widgets` channel so it
 * never makes a sound of its own.
 *
 * Skip / +30s: the native receiver re-renders the notification from the
 * layout's `onClick` results first (works with the app dead), then emits a
 * user-interaction event. When JS is alive, `subscribeRestOngoingActions`
 * forwards it to the same `stop()` / `add(30)` the in-app bar uses, which
 * re-posts from the store, so the two never disagree.
 */
import { isRunningInExpoGo } from 'expo';

import {
  REST_ONGOING_ID,
  REST_TARGETS,
  adoptableDeadline,
  buildRestOngoingProps,
  restOngoingUrl,
  type RestOngoingInput,
  type RestOngoingProps,
} from './build';

type Factory = typeof import('@/widgets/rest-notification').default;

let factory: Factory | null = null;
function getFactory(): Factory | null {
  if (isRunningInExpoGo()) return null;
  if (!factory) {
    try {
      // Lazy require keeps the widget runtime and Jetpack Compose UI out of
      // Expo Go and out of the module graph until the first rest.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      factory = (require('@/widgets/rest-notification') as typeof import('@/widgets/rest-notification'))
        .default;
    } catch {
      return null;
    }
  }
  return factory;
}

const formatTime = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Post or replace the notification for the running rest. */
export async function showRestOngoing(input: Omit<RestOngoingInput, 'formatTime'>): Promise<void> {
  const f = getFactory();
  if (!f || input.deadline <= Date.now()) return;
  try {
    await f.post(buildRestOngoingProps({ ...input, formatTime }), {
      id: REST_ONGOING_ID,
      ongoing: true,
      autoCancel: false,
      alertOnlyOnce: true,
      title: input.exerciseName ? `Rest · ${input.exerciseName}` : 'Rest',
      url: restOngoingUrl(input.sessionId),
    });
  } catch {
    // Notifications disabled / not permitted — the in-app bar still works.
  }
}

export async function hideRestOngoing(): Promise<void> {
  const f = getFactory();
  if (!f) return;
  try {
    await f.cancelAll();
  } catch {
    // Nothing posted.
  }
}

/**
 * Deadline left by native button presses while JS wasn't listening (cold
 * start, or the session screen was unmounted). Null when none applies.
 */
export async function readRestOngoingDeadline(sessionId: number): Promise<number | null> {
  const f = getFactory();
  if (!f) return null;
  try {
    const active = await f.get(REST_ONGOING_ID);
    if (!active) return null;
    const props = (await active.getProps()) as Partial<RestOngoingProps>;
    return adoptableDeadline(props, sessionId, Date.now());
  } catch {
    return null;
  }
}

export function subscribeRestOngoingActions(handlers: {
  onSkip: () => void;
  onAdd: (seconds: number) => void;
}): () => void {
  if (!getFactory()) return () => {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { addUserInteractionListener } = require('expo-widgets') as typeof import('expo-widgets');
    const sub = addUserInteractionListener((event) => {
      if (event.source !== 'RestTimer') return;
      if (event.target === REST_TARGETS.skip) handlers.onSkip();
      else if (event.target === REST_TARGETS.add) handlers.onAdd(30);
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
