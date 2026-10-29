/**
 * Props for the ongoing rest notification (Android lock screen / shade).
 *
 * Pure formatting, unit-tested in `src/lib/__tests__/rest-ongoing.test.ts`.
 * The layout (`src/widgets/rest-notification.tsx`) runs in the isolated
 * widget runtime with no imports and no module scope, so every string it
 * shows is prepared here — including the end-time label after each native
 * "+30s" press (`endsLabels[added]`), because those presses can be handled
 * while the app process is dead.
 */
import { formatWeight } from '@/db/calc';
import type { Unit } from '@/db/types';

import { WIDGET_LINKS } from '../widgets/build-extra';

/** One notification for the whole app: a new rest replaces it in place. */
export const REST_ONGOING_ID = 'incline-rest';
export const REST_ADD_SECONDS = 30;
/** Native "+30s" presses supported without the app (one label each). */
export const REST_MAX_NATIVE_ADDS = 10;

export const REST_TARGETS = { skip: 'rest-skip', add: 'rest-add' } as const;

export interface RestOngoingProps {
  sessionId: number;
  /** "Rest · Bench Press". */
  label: string;
  /** Epoch ms the rest ends — drives the native header chronometer (patch). */
  countdownTo: number;
  /** "Until 2:32 PM" for 0, 1, … REST_MAX_NATIVE_ADDS native "+30s" presses. */
  endsLabels: string[];
  /** Native "+30s" presses since the app last posted. */
  added: number;
  /** "Next: Set 3 · 80 kg × 8"; null when nothing is left to log. */
  next: string | null;
  /** Set by a native Skip press; the patched builder then removes it. */
  finished: boolean;
}

export interface RestNextSet {
  /** 1-based position within the exercise. */
  setNumber: number;
  weightKg: number;
  reps: number;
  unit: Unit;
  warmUp?: boolean;
}

export interface RestOngoingInput {
  sessionId: number;
  exerciseName: string | null;
  deadline: number;
  next: RestNextSet | null;
  /** Locale clock time, e.g. "2:32 PM" / "14:32". Injected for tests. */
  formatTime: (ms: number) => string;
}

export function formatNextSet(next: RestNextSet | null): string | null {
  if (!next) return null;
  const name = next.warmUp ? 'Warm-up' : `Set ${next.setNumber}`;
  const load =
    next.weightKg > 0 && next.reps > 0
      ? `${formatWeight(next.weightKg, next.unit)} × ${next.reps}`
      : next.reps > 0
        ? `${next.reps} reps`
        : next.weightKg > 0
          ? formatWeight(next.weightKg, next.unit)
          : null;
  return load ? `Next: ${name} · ${load}` : `Next: ${name}`;
}

export function buildRestOngoingProps(input: RestOngoingInput): RestOngoingProps {
  const name = input.exerciseName?.trim();
  const endsLabels: string[] = [];
  for (let i = 0; i <= REST_MAX_NATIVE_ADDS; i++) {
    endsLabels.push(`Until ${input.formatTime(input.deadline + i * REST_ADD_SECONDS * 1000)}`);
  }
  return {
    sessionId: input.sessionId,
    label: name ? `Rest · ${name}` : 'Rest',
    countdownTo: input.deadline,
    endsLabels,
    added: 0,
    next: formatNextSet(input.next),
    finished: false,
  };
}

export interface RestSessionSet {
  exerciseId: number;
  exerciseName: string;
  completed: boolean;
  weight: number;
  reps: number;
  setType?: string;
}

/**
 * The set the user rests for: the first unfinished set in session order,
 * numbered among its exercise's non-warm-up sets (as the set rows are).
 */
export function pickRestTarget(
  sets: readonly RestSessionSet[],
  unitFor: (exerciseId: number) => Unit,
): { exerciseName: string | null; next: RestNextSet | null } {
  const target = sets.find((s) => !s.completed);
  if (!target) return { exerciseName: null, next: null };
  const warmUp = target.setType === 'warmup';
  let setNumber = 0;
  for (const s of sets) {
    if (s.exerciseId !== target.exerciseId || s.setType === 'warmup') continue;
    setNumber++;
    if (s === target) break;
  }
  return {
    exerciseName: target.exerciseName,
    next: {
      setNumber: Math.max(1, setNumber),
      weightKg: target.weight,
      reps: target.reps,
      unit: unitFor(target.exerciseId),
      warmUp,
    },
  };
}

export function restOngoingUrl(sessionId: number): string {
  return WIDGET_LINKS.session(sessionId);
}

/**
 * A rest notification found on (re)mount, possibly changed by native button
 * presses while JS was not listening. Returns the deadline to adopt, or null
 * when it is skipped, over, or belongs to another session.
 */
export function adoptableDeadline(
  props: Partial<RestOngoingProps> | null | undefined,
  sessionId: number,
  now: number,
): number | null {
  if (!props || props.finished || props.sessionId !== sessionId) return null;
  const to = typeof props.countdownTo === 'number' ? props.countdownTo : 0;
  return to > now + 999 ? to : null;
}
