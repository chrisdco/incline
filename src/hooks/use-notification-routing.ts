import { useEffect, useRef } from 'react';
import { router, type Href } from 'expo-router';

import { actionForResponse, pathForNotificationAction } from '@/lib/notifications/actions';
import { getNotifications } from '@/lib/notifications/core';
import { navigateFromNotificationData } from '@/lib/notifications/deep-link';
import { isNotificationPayload } from '@/lib/notifications/types';
import { cancelRestCompleteNotification, scheduleRestCompleteNotification } from '@/lib/rest-notification';

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
      notification: { request: { identifier: string; content: { data?: unknown } } };
    } | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledResponseId.current === id) return;
      handledResponseId.current = id;
      const data = response.notification.request.content.data;
      const action = actionForResponse(response.actionIdentifier, data);
      if (action?.kind === 'snooze_rest') {
        // Notification-level snooze: re-ping in a minute. The in-app timer
        // stays source of truth while the session screen is open.
        void (async () => {
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
