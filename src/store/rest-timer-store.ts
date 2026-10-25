import { create } from 'zustand';

/**
 * Rest countdown state, outside React component state so the 1s tick only
 * re-renders subscribers of `remaining` (the timer bar), never the whole
 * session tree. Control logic stays in `useRestTimer`; this is just the cell.
 *
 * In-memory only: a wall-clock `deadline` lets a remounted session screen
 * resume the countdown, but a cold start begins with no rest running.
 */
export interface RestTimerState {
  /** Session the countdown belongs to; another session's mount resets it. */
  sessionId: number | null;
  remaining: number;
  total: number;
  running: boolean;
  /** Epoch ms when rest ends; 0 when idle. */
  deadline: number;
}

export const REST_TIMER_IDLE: Omit<RestTimerState, 'sessionId'> = {
  remaining: 0,
  total: 0,
  running: false,
  deadline: 0,
};

export const useRestTimerStore = create<RestTimerState>(() => ({
  sessionId: null,
  ...REST_TIMER_IDLE,
}));

/** Bar visible: running, or showing "Done" until the finish latch clears. */
export const selectRestVisible = (s: RestTimerState) => s.total > 0;
export const selectRestJustFinished = (s: RestTimerState) =>
  s.total > 0 && s.remaining === 0 && !s.running;
