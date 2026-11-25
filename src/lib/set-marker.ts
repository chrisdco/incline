import type { SetType } from '@/db/types';

/**
 * How a set's type reads in the set column, everywhere a set list appears
 * (active session, finished-workout summary). Hevy/Strong pattern:
 * W · 1 · 2 · D · F. Keep one map so the summary never drifts from logging.
 */
export const SET_TYPE_BADGE: Record<SetType, { letter: string; className: string }> = {
  working: { letter: '1', className: 'text-foreground' },
  warmup: { letter: 'W', className: 'text-warning' },
  drop: { letter: 'D', className: 'text-info' },
  failure: { letter: 'F', className: 'text-destructive' },
};

export const SET_TYPE_LABEL: Record<SetType, string> = {
  working: 'Working set',
  warmup: 'Warm-up',
  drop: 'Drop set',
  failure: 'To failure',
};

/** Shown set numbers: a drop set keeps the number of the set above it. */
export function setNumbers(sets: readonly { setType?: string | null }[]): number[] {
  const out: number[] = [];
  let n = 0;
  for (const s of sets) {
    if (s.setType !== 'drop') n += 1;
    out.push(n);
  }
  return out;
}
