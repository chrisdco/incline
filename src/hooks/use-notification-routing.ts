import { useEffect, useRef } from 'react';
import { router, type Href } from 'expo-router';

import { actionForResponse, pathForNotificationAction } from '@/lib/notifications/actions';
import { getNotifications } from '@/lib/notifications/core';
import { navigateFromNotificationData } from '@/lib/notifications/deep-link';
import { isNotificationPayload } from '@/lib/notifications/types';
import {
  cancelRestCompleteNotification,
  clearRestCompleteNotification,
  scheduleRestCompleteNotification,
} from '@/lib/rest-notification';
import { signalRestRequest } from '@/lib/rest-timer-signal';

/**
 * Handle taps on local (and later remote) notifications via typed payloads.
 * Action buttons (+1 min / Skip / View routines) are consumed here; body
 * taps fall through to payload deep-linking. Cold start: consume last
 * response once. Warm: listen for responses.
 */
export function useNotificationRouting() {
  const handledResponseId = useRef<string | null>(null);

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
        // Snooze both sides. The scheduled alert is re-armed here because the
        // response arrives as the app opens, and the in-app countdown is
        // handed to the session screen through the signal bus (it starts on
        // mount if the screen was not alive yet).
        signalRestRequest({ seconds: action.seconds, sessionId: action.sessionId });
        void (async () => {
          await cancelRestCompleteNotification();
          await scheduleRestCompleteNotification(action.seconds, { sessionId: action.sessionId });
        })();
        const path = pathForNotificationAction(action);
        if (path) {
          try {
            router.push(path as Href);
          } catch {
            // Router may not be mounted yet; cold-start path retries via last response.
          }
        }
        return;
      }
      if (action?.kind === 'skip_rest') {
        void clearRestCompleteNotification();
        return;
      }
      if (action) {
        const path = pathForNotificationAction(action);
        if (path) {
          try {
            router.push(path as Href);
          } catch {
            // Router may not be mounted yet; cold-start path retries via last response.
          }
        }
        return;
      }
      if (isNotificationPayload(data)) {
        navigateFromNotificationData(data);
      }
    };

    handleResponse(mod.getLastNotificationResponse());

    const sub = mod.addNotificationResponseReceivedListener((response) => {
      handleResponse(response);
    });
    return () => sub.remove();
  }, []);
}
