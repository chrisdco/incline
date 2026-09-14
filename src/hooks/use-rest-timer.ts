import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  cancelRestCompleteNotification,
  scheduleRestCompleteNotification,
} from '@/lib/rest-notification';

/**
 * Local rest-timer countdown. Kept local to the session screen (no global
 * ticking) so the rest of the app doesn't re-render every second.
 *
 * Handles backgrounding via wall-clock deadlines, and schedules a local
 * notification so rest completion still alerts when the user leaves the session.
 */
export function useRestTimer(opts?: { notify?: boolean; sessionId?: number }) {
  const notify = opts?.notify !== false;
  const sessionId = opts?.sessionId;
  const [remaining, setRemaining] = useState(0);
  const [total, setTotal] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<number>(0);

  const syncNotification = useCallback(
    async (seconds: number | null) => {
      if (!notify) {
        await cancelRestCompleteNotification();
        return;
      }
      if (seconds == null || seconds <= 0) {
        await cancelRestCompleteNotification();
        return;
      }
      await scheduleRestCompleteNotification(seconds, { sessionId });
    },
    [notify, sessionId],
  );

  const start = useCallback(
    (seconds: number) => {
      if (seconds <= 0) return;
      setTotal(seconds);
      setRemaining(seconds);
      setRunning(true);
      deadlineRef.current = Date.now() + seconds * 1000;
      void syncNotification(seconds);
    },
    [syncNotification],
  );

  const stop = useCallback(() => {
    setRunning(false);
    setRemaining(0);
    setTotal(0);
    deadlineRef.current = 0;
    void syncNotification(null);
  }, [syncNotification]);

  const add = useCallback(
    (delta: number) => {
      setRemaining((r) => {
        const next = Math.max(0, r + delta);
        if (next === 0) {
          deadlineRef.current = 0;
          void syncNotification(null);
          setRunning(false);
        } else {
          deadlineRef.current = Date.now() + next * 1000;
          void syncNotification(next);
          setRunning(true);
        }
        return next;
      });
    },
    [syncNotification],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && running && deadlineRef.current > 0) {
        const now = Date.now();
        const diff = deadlineRef.current - now;
        if (diff <= 0) {
          setRemaining(0);
          setRunning(false);
          deadlineRef.current = 0;
          void syncNotification(null);
        } else {
          setRemaining(Math.ceil(diff / 1000));
        }
      }
    });
    return () => sub.remove();
  }, [running, syncNotification]);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const diff = deadlineRef.current - now;
      if (diff <= 0) {
        setRemaining(0);
        setRunning(false);
        deadlineRef.current = 0;
        void syncNotification(null);
      } else {
        setRemaining(Math.ceil(diff / 1000));
      }
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, syncNotification]);

  const justFinished = total > 0 && remaining === 0 && !running;

  useEffect(() => {
    if (!justFinished) return;
    void syncNotification(null);
    const t = setTimeout(() => {
      setTotal(0);
      deadlineRef.current = 0;
    }, 1400);
    return () => clearTimeout(t);
  }, [justFinished, syncNotification]);

  return { remaining, total, running, justFinished, start, stop, add };
}
