import { describe, expect, it } from 'vitest';

import { pausedMinutes, retimeWorkout, withClockTime } from '@/contracts/workout-time';

const M = 60_000;
const now = Date.UTC(2026, 10, 18, 18, 0);
const t = { startedAt: now - 3 * 60 * M, endedAt: now - 2 * 60 * M, durationSeconds: 50 * 60 };

describe('retimeWorkout', () => {
  it('start, finish and duration each leave the untouched field alone', () => {
    const s = retimeWorkout(t, { kind: 'start', startedAt: t.startedAt + 10 * M }, now);
    expect(s).toEqual({ ok: true, times: { ...t, startedAt: t.startedAt + 10 * M, durationSeconds: 40 * 60 } });

    const e = retimeWorkout(t, { kind: 'end', endedAt: t.endedAt + 10 * M }, now);
    expect(e).toEqual({ ok: true, times: { ...t, endedAt: t.endedAt + 10 * M, durationSeconds: 60 * 60 } });

    const d = retimeWorkout(t, { kind: 'duration', seconds: 30 * 60 }, now);
    expect(d).toEqual({ ok: true, times: { ...t, endedAt: t.endedAt - 20 * M, durationSeconds: 30 * 60 } });
  });

  it('keeps the paused gap through edits', () => {
    expect(pausedMinutes(t)).toBe(10);
    const s = retimeWorkout(t, { kind: 'start', startedAt: t.startedAt - 5 * M }, now);
    expect(s.ok && pausedMinutes(s.times)).toBe(10);
  });

  it('rejects finishing in the future, under a minute, or out of order', () => {
    expect(retimeWorkout(t, { kind: 'duration', seconds: 4 * 3600 }, now)).toEqual({ ok: false, error: 'in_future' });
    expect(retimeWorkout(t, { kind: 'duration', seconds: 30 }, now)).toEqual({ ok: false, error: 'too_short' });
    expect(retimeWorkout(t, { kind: 'end', endedAt: t.startedAt }, now)).toEqual({ ok: false, error: 'end_before_start' });
    expect(retimeWorkout(t, { kind: 'date', startedAt: now + 24 * 60 * M }, now)).toEqual({ ok: false, error: 'in_future' });
  });

  it('an open session only moves its start', () => {
    const open = { ...t, endedAt: null, durationSeconds: 0 };
    expect(retimeWorkout(open, { kind: 'start', startedAt: t.startedAt - M }, now)).toEqual({
      ok: true,
      times: { ...open, startedAt: t.startedAt - M },
    });
    expect(retimeWorkout(open, { kind: 'end', endedAt: now }, now)).toEqual({ ok: false, error: 'not_finished' });
  });
});

describe('withClockTime', () => {
  it('rolls a finish time past midnight to the next day only for a short overnight session', () => {
    const start = new Date(2026, 10, 18, 23, 30).getTime();
    const end = withClockTime(start, new Date(2026, 0, 1, 0, 40), { after: start });
    expect(end - start).toBe(70 * M);
    const wrong = withClockTime(start, new Date(2026, 0, 1, 9, 0), { after: start });
    expect(wrong).toBeLessThan(start);
  });
});
