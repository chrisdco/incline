import { useEffect, useRef } from 'react';
import { router, useSegments, type Href } from 'expo-router';

import { getWorkoutLogState } from '@/db/queries';
import { actionForResponse, pathForNotificationAction } from '@/lib/notifications/actions';
import { getNotifications } from '@/lib/notifications/core';
import { createPendingRoute, isAppRouteReady } from '@/lib/notifications/pending-route';
import {
  pathForNotificationPayload,
  pathForSessionLog,
  sessionIdForPayload,
} from '@/lib/notifications/routes';
import { isNotificationPayload } from '@/lib/notifications/types';
import { cancelRestCompleteNotification, scheduleRestCompleteNotification } from '@/lib/rest-notification';
import { signalRestRequest } from '@/lib/rest-timer-signal';

// App-lifetime: a cold-start tap outlives the first render's effects.
const pendingRoute = createPendingRoute((path) => {
  try {
    router.push(path as Href);
  } catch {
    // Navigator gone mid-flush; the tap is dropped rather than retried forever.
  }
});

/** Live session, summary or home, depending on the log as it is now (#152). */
async function resolveSessionPath(sessionId: number): Promise<string> {
  try {
    return pathForSessionLog(sessionId, await getWorkoutLogState(sessionId));
  } catch {
    // Read failed: keep the old target; the session screen handles a miss.
    return `/session/${sessionId}`;
  }
}

/**
 * Handle taps on local (and later remote) notifications via typed payloads.
 * Action buttons (+1 min / Skip / View routines) are consumed here; body
 * taps fall through to payload deep-linking. Cold start: consume last
 * response once. Warm: listen for responses. Either way the target waits in
 * `pendingRoute` until the gate has routed into the app (#151).
 */
export function useNotificationRouting() {
  const handledResponseId = useRef<string | null>(null);
  const ready = isAppRouteReady(useSegments());

  useEffect(() => {
    pendingRoute.setReady(ready);
  }, [ready]);

  useEffect(() => {
    const mod = getNotifications();
    if (!mod) return;

    const handleResponse = (response: {
      actionIdentifier?: string;
      notification: {
        /** Delivery timestamp — same on a cold-start replay, new on a re-fire. */
        date?: number;
        request: { identifier: string; content: { data?: unknown } };
      };
    } | null) => {
      if (!response) return;
      const request = response.notification.request;
      // Rest alerts reuse one schedule id, so key on the delivery too: a
      // re-fired alert must be handled again, a cold-start replay must not.
      const key = `${request.identifier}:${response.notification.date ?? ''}`;
      if (handledResponseId.current === key) return;
      handledResponseId.current = key;
      const data = request.content.data;
      const action = actionForResponse(response.actionIdentifier, data);
      if (action?.kind === 'snooze_rest') {
        void (async () => {
          // A snooze from an alert that outlived its workout (finished or
          // discarded since) must not restart rest for a dead session (#152).
          const sessionPath =
            action.sessionId != null ? await resolveSessionPath(action.sessionId) : null;
          if (sessionPath != null && !sessionPath.startsWith('/session/')) {
            await cancelRestCompleteNotification();
            pendingRoute.navigate(sessionPath);
            return;
          }
          // Snooze both sides. The scheduled alert is re-armed here because
          // the response arrives as the app opens, and the in-app countdown
          // is handed to the session screen through the signal bus (it
          // starts on mount if the screen was not alive yet).
          signalRestRequest({ seconds: action.seconds, sessionId: action.sessionId });
          const path = pathForNotificationAction(action);
          if (path) pendingRoute.navigate(path);
          await cancelRestCompleteNotification();
          await scheduleRestCompleteNotification(action.seconds, { sessionId: action.sessionId });
        })();
        return;
      }
      if (action?.kind === 'skip_rest') {
        void cancelRestCompleteNotification();
        return;
      }
      if (action) {
        const path = pathForNotificationAction(action);
        if (path) pendingRoute.navigate(path);
        return;
      }
      if (isNotificationPayload(data)) {
        const sessionId = sessionIdForPayload(data);
        if (sessionId != null) {
          void resolveSessionPath(sessionId).then((path) => pendingRoute.navigate(path));
          return;
        }
        const path = pathForNotificationPayload(data);
        if (path) pendingRoute.navigate(path);
      }
    };

    // Sync getter is the supported API in expo-notifications 58 (the async
    // one is a deprecated wrapper); it throws where the native module lacks it.
    try {
      handleResponse(mod.getLastNotificationResponse());
    } catch {
      // Unsupported runtime: warm taps still arrive through the listener.
    }

    const sub = mod.addNotificationResponseReceivedListener((response) => {
      handleResponse(response);
    });
    return () => sub.remove();
  }, []);
}
