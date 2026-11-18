/**
 * Editing a finished workout's times (docs/decisions/WORKOUT-SETS.md §Times).
 *
 * Start, finish and duration are linked like a calendar event, and the field
 * you didn't touch stays put:
 * - start → finish stays, duration changes by the same amount
 * - finish → start stays, duration changes by the same amount
 * - duration → start stays, finish moves
 * - date → the whole workout moves to that day; times and duration keep
 *
 * Duration is active time: it can be shorter than finish − start when the
 * session was paused. Edits shift it by the same delta, so the paused gap
 * survives every edit.
 */

export interface WorkoutTimes {
  startedAt: number;
  /** Null while the session is still open. */
  endedAt: number | null;
  durationSeconds: number;
}

export type RetimeChange =
  | { kind: 'date'; startedAt: number }
  | { kind: 'start'; startedAt: number }
  | { kind: 'end'; endedAt: number }
  | { kind: 'duration'; seconds: number };

export type RetimeError = 'start_after_end' | 'end_before_start' | 'in_future' | 'too_short' | 'not_finished';

export type RetimeResult = { ok: true; times: WorkoutTimes } | { ok: false; error: RetimeError };

/** Shortest duration an edit may leave. */
export const MIN_WORKOUT_SECONDS = 60;
/** Clock-skew allowance for "not in the future". */
const FUTURE_SLACK_MS = 60_000;

export const RETIME_ERROR_MESSAGE: Record<RetimeError, string> = {
  start_after_end: 'Start has to be before the finish time.',
  end_before_start: 'Finish has to be after the start time.',
  in_future: 'A workout can’t finish in the future. Move the start earlier instead.',
  too_short: 'That leaves less than a minute of training.',
  not_finished: 'Finish the workout first, then edit its times.',
};

export function retimeWorkout(t: WorkoutTimes, change: RetimeChange, now: number): RetimeResult {
  const latest = now + FUTURE_SLACK_MS;
  const fail = (error: RetimeError): RetimeResult => ({ ok: false, error });

  switch (change.kind) {
    case 'date': {
      const delta = change.startedAt - t.startedAt;
      const endedAt = t.endedAt == null ? null : t.endedAt + delta;
      if ((endedAt ?? change.startedAt) > latest) return fail('in_future');
      return { ok: true, times: { ...t, startedAt: change.startedAt, endedAt } };
    }
    case 'start': {
      if (change.startedAt > latest) return fail('in_future');
      // Open session: only the clock's origin moves.
      if (t.endedAt == null) return { ok: true, times: { ...t, startedAt: change.startedAt } };
      if (change.startedAt >= t.endedAt) return fail('start_after_end');
      const durationSeconds = Math.round(t.durationSeconds + (t.startedAt - change.startedAt) / 1000);
      if (durationSeconds < MIN_WORKOUT_SECONDS) return fail('too_short');
      return { ok: true, times: { ...t, startedAt: change.startedAt, durationSeconds } };
    }
    case 'end': {
      if (t.endedAt == null) return fail('not_finished');
      if (change.endedAt <= t.startedAt) return fail('end_before_start');
      if (change.endedAt > latest) return fail('in_future');
      const durationSeconds = Math.round(t.durationSeconds + (change.endedAt - t.endedAt) / 1000);
      if (durationSeconds < MIN_WORKOUT_SECONDS) return fail('too_short');
      return { ok: true, times: { ...t, endedAt: change.endedAt, durationSeconds } };
    }
    case 'duration': {
      if (t.endedAt == null) return fail('not_finished');
      const seconds = Math.round(change.seconds);
      if (seconds < MIN_WORKOUT_SECONDS) return fail('too_short');
      const endedAt = t.endedAt + (seconds - t.durationSeconds) * 1000;
      if (endedAt > latest) return fail('in_future');
      return { ok: true, times: { ...t, endedAt, durationSeconds: seconds } };
    }
  }
}

/** Minutes the session spent paused (finish − start − active), floored at 0. */
export function pausedMinutes(t: WorkoutTimes): number {
  if (t.endedAt == null) return 0;
  return Math.max(0, Math.round((t.endedAt - t.startedAt) / 60_000 - t.durationSeconds / 60));
}

/**
 * Put a picked clock time onto a base day. For the finish time, a result at
 * or before the start rolls to the next day (a session past midnight).
 */
export function withClockTime(base: number, picked: Date, opts?: { after?: number }): number {
  const d = new Date(base);
  d.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  let out = d.getTime();
  const day = 24 * 60 * 60 * 1000;
  // Only a plausible overnight session rolls; anything longer is a mistake
  // the caller rejects (finish before start).
  if (opts?.after != null && out <= opts.after && out + day - opts.after < 8 * 60 * 60 * 1000) out += day;
  return out;
}
