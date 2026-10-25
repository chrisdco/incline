import { useCallback, useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  cancelRestCompleteNotification,
  scheduleRestCompleteNotification,
} from '@/lib/rest-notification';
import {
  consumeRestRequest,
  subscribeRestRequest,
  type RestRequest,
} from '@/lib/rest-timer-signal';
import {
  REST_TIMER_IDLE,
  selectRestJustFinished,
  selectRestVisible,
  useRestTimerStore,
} from '@/store/rest-timer-store';

const store = useRestTimerStore;

/**
 * Rest-timer controller for the session screen.
 *
 * The countdown lives in `rest-timer-store`, and this hook only subscribes to
 * the rarely-changing flags (`running`, `visible`, `justFinished`). The 1s
 * tick writes `remaining`, which only the timer bar reads (`RestTimerBar`),
 * so a rest — most of a gym session — no longer re-renders every set row.
 *
 * Handles backgrounding via wall-clock deadlines, and schedules a local
 * notification so rest completion still alerts when the user leaves the session.
 */
export function useRestTimer(opts?: { notify?: boolean; sessionId?: number }) {
  const notify = opts?.notify !== false;
  const sessionId = opts?.sessionId;
  const running = useRestTimerStore((s) => s.running);
  const visible = useRestTimerStore(selectRestVisible);
  const justFinished = useRestTimerStore(selectRestJustFinished);

  // A different session must not inherit the previous one's countdown.
  useEffect(() => {
    const cur = store.getState();
    if (cur.sessionId !== (sessionId ?? null)) {
      store.setState({ sessionId: sessionId ?? null, ...REST_TIMER_IDLE });
    }
  }, [sessionId]);

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

  /** Recompute from the deadline; ends the rest when it has passed. */
  const tick = useCallback(() => {
    const { deadline } = store.getState();
    if (deadline <= 0) return;
    const diff = deadline - Date.now();
    if (diff <= 0) {
      store.setState({ remaining: 0, running: false, deadline: 0 });
      void syncNotification(null);
    } else {
      const next = Math.ceil(diff / 1000);
      if (next !== store.getState().remaining) store.setState({ remaining: next });
    }
  }, [syncNotification]);

  const start = useCallback(
    (seconds: number): { replaced: boolean; discardedSeconds: number } => {
      if (seconds <= 0) return { replaced: false, discardedSeconds: 0 };
      // Auto-start replacing auto-start is standard (Strong/Hevy do the
      // same). Only report when a genuinely large remainder is discarded —
      // per-round superset restarts stay quiet.
      const { deadline } = store.getState();
      const discardedSeconds =
        deadline > 0 ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0;
      store.setState({
        total: seconds,
        remaining: seconds,
        running: true,
        deadline: Date.now() + seconds * 1000,
      });
      void syncNotification(seconds);
      return { replaced: discardedSeconds > 0, discardedSeconds };
    },
    [syncNotification],
  );

  const stop = useCallback(() => {
    store.setState(REST_TIMER_IDLE);
    void syncNotification(null);
  }, [syncNotification]);

  const add = useCallback(
    (delta: number) => {
      const next = Math.max(0, store.getState().remaining + delta);
      if (next === 0) {
        // Dropping to zero ends the rest instead of leaving a dead 0s timer.
        store.setState({ remaining: 0, running: false, deadline: 0 });
        void syncNotification(null);
      } else {
        store.setState({ remaining: next, running: true, deadline: Date.now() + next * 1000 });
        void syncNotification(next);
      }
    },
    [syncNotification],
  );

  useEffect(() => {
    // A "+1 min" tap in the shade restarts rest here — including a cold start,
    // where the request waits in the signal bus until this screen mounts.
    const accept = (request: RestRequest) => {
      if (request.sessionId != null && sessionId != null && request.sessionId !== sessionId) return;
      if (request.seconds > 0) start(request.seconds);
    };
    const pending = consumeRestRequest(sessionId);
    if (pending) accept(pending);
    return subscribeRestRequest(accept);
  }, [start, sessionId]);

  useEffect(() => {
    if (!running) return;
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') tick();
    });
    tick();
    const iv = setInterval(tick, 1000);
    return () => {
      clearInterval(iv);
      sub.remove();
    };
  }, [running, tick]);

  useEffect(() => {
    if (!justFinished) return;
    void syncNotification(null);
    const t = setTimeout(() => {
      store.setState({ total: 0, deadline: 0 });
    }, 1400);
    return () => clearTimeout(t);
  }, [justFinished, syncNotification]);

  return { running, visible, justFinished, start, stop, add };
}
