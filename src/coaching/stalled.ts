import { detectPlateau, plateauSignal, type TopSetSample } from './reason';

/** Only lifts trained this recently count as "stalled"; older ones are just paused. */
export const STALLED_RECENT_DAYS = 42;
/** Progress shows a compact list, not every lift. */
export const STALLED_MAX = 5;

const DAY_MS = 86_400_000;

export interface StalledLift {
  exerciseId: number;
  name: string;
  sessions: number;
  sentence: string;
  lastAt: number;
}

/**
 * Exercises with a plateau signal, from batched top-set histories (newest
 * first per exercise). Pure: same rule as the "Why this weight?" plateau
 * note, never a different number. Most sessions stalled first, then most
 * recently trained.
 */
export function collectStalledLifts(
  histories: Readonly<Record<number, TopSetSample[]>>,
  names: Readonly<Record<number, string>>,
  now: number,
  limit = STALLED_MAX,
): StalledLift[] {
  const out: StalledLift[] = [];
  for (const [key, history] of Object.entries(histories)) {
    const exerciseId = Number(key);
    const lastAt = history[0]?.startedAt;
    if (lastAt == null || now - lastAt > STALLED_RECENT_DAYS * DAY_MS) continue;
    const plateau = detectPlateau(history);
    const signal = plateauSignal(history);
    if (!plateau || !signal) continue;
    out.push({
      exerciseId,
      name: names[exerciseId] ?? 'Exercise',
      sessions: plateau.sessions,
      sentence: signal.sentence,
      lastAt,
    });
  }
  out.sort((a, b) => b.sessions - a.sessions || b.lastAt - a.lastAt);
  return out.slice(0, limit);
}
