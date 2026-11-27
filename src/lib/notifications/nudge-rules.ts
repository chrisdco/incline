/**
 * Pure nudge rules (no imports at all): caps and firing conditions for the
 * capped motivational nudges. Schedulers live in nudges.ts; tests import
 * from here so react-native never loads under vitest.
 */

export const ABANDONED_IDLE_MS = 25 * 60 * 1000;
/** Streak nudges only fire Thu–Sun (JS days), when a save is still possible. */
export const STREAK_NUDGE_DAYS = [4, 5, 6, 0] as const;

/** Monday-based week key (YYYY-MM-DD of Monday) for the weekly streak cap. */
export function mondayWeekKey(at = Date.now()): string {
  const d = new Date(at);
  const jsDay = d.getDay();
  const back = (jsDay + 6) % 7;
  d.setDate(d.getDate() - back);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Abandoned session: an open log whose last activity (latest set update,
 * or start when empty) is older than the idle window.
 */
export function shouldNudgeAbandoned(
  now: number,
  lastActivityAt: number,
  lastNudgedLogId: number | null,
  logId: number,
): boolean {
  if (lastNudgedLogId === logId) return false;
  return now - lastActivityAt >= ABANDONED_IDLE_MS;
}

/**
 * Seconds until the abandoned ping should fire when the app leaves the
 * foreground with a session open: the rest of the idle window from the last
 * activity, at least 1 s. Null when this session was already nudged.
 */
export function abandonedNudgeDelaySeconds(
  now: number,
  lastActivityAt: number,
  lastNudgedLogId: number | null,
  logId: number,
): number | null {
  if (lastNudgedLogId === logId) return null;
  return Math.max(1, Math.ceil((lastActivityAt + ABANDONED_IDLE_MS - now) / 1000));
}

/** Streak at risk: a live streak, nothing logged this week, late in the week. */
export function shouldNudgeStreak(
  now: number,
  streakWeeks: number,
  sessionsThisWeek: number,
  lastNudgeWeekKey: string | null,
): boolean {
  if (streakWeeks <= 0 || sessionsThisWeek > 0) return false;
  const jsDay = new Date(now).getDay();
  if (!(STREAK_NUDGE_DAYS as readonly number[]).includes(jsDay)) return false;
  return lastNudgeWeekKey !== mondayWeekKey(now);
}

/** Achievement ids that unlocked since the last seen set. */
export function newlyUnlockedAchievementIds(
  seenIds: readonly string[],
  statuses: { id: string; unlocked: boolean }[],
): string[] {
  const seen = new Set(seenIds);
  return statuses.filter((s) => s.unlocked && !seen.has(s.id)).map((s) => s.id);
}
