import { formatMonthLabel, formatVolume, monthKey, previousMonthStart, startOfWeek } from '@/db/calc';
import type { ProgressStats, Unit } from '@/db/types';
import type { Announcement } from '@/lib/announcements/types';
import { weekInsightFromStats } from '@/lib/week-insight';

const WEEK_MS = 7 * 86_400_000;
const DAY_MS = 86_400_000;

export type HomeContextIcon =
  | 'calendar'
  | 'sparkles'
  | 'flame'
  | 'target'
  | 'trophy'
  | 'megaphone'
  | 'trend';

export type HomeContextCardKind =
  | 'report_month'
  | 'report_week'
  | 'inactivity'
  | 'weekly_goal'
  | 'month_target'
  | 'pr_nudge'
  | 'announcement'
  | 'coaching';

export interface HomeContextCard {
  id: string;
  kind: HomeContextCardKind;
  priority: number;
  title: string;
  subtitle: string;
  href?: string;
  /** Persisted dismiss key (announcements). */
  dismissKey?: string;
  icon: HomeContextIcon;
}

export interface HomeContextInput {
  now?: number;
  stats: ProgressStats | null | undefined;
  unit: Unit;
  weeklyGoal: number;
  sessionsThisWeek: number;
  goalMet: boolean;
  sessionsToGoal: number;
  dismissedAnnouncementIds: string[];
  announcements: Announcement[];
  /** Optional coaching line from the insights engine. */
  coachingTitle?: string | null;
  coachingSubtitle?: string | null;
  coachingHref?: string | null;
  /** Recent PR candidate for nudge. */
  prNudge?: { exerciseName: string; weight: number; reps: number; templateId?: number } | null;
  minSessionsForContext?: number;
}

function isMondayLocal(now: number): boolean {
  return new Date(now).getDay() === 1;
}

function isEarlyMonth(now: number): boolean {
  return new Date(now).getDate() <= 14;
}

function lastMonthHadSessions(stats: ProgressStats, now: number): boolean {
  const last = previousMonthStart(now);
  const lastMonth = new Date(last).getMonth();
  const lastYear = new Date(last).getFullYear();
  return (stats.weeklyVolume ?? []).some((w) => {
    const d = new Date(`${w.weekStart}T00:00:00`);
    return d.getFullYear() === lastYear && d.getMonth() === lastMonth && w.sessions > 0;
  });
}

function daysSince(ms: number | null | undefined, now: number): number | null {
  if (ms == null) return null;
  return Math.floor((now - ms) / DAY_MS);
}

function monthSessionTarget(stats: ProgressStats, now: number): { remaining: number; lastMonthSessions: number } | null {
  const weeks = stats.weeklyVolume ?? [];
  if (weeks.length < 2) return null;
  const thisMonthKey = new Date(now).getMonth();
  const thisYear = new Date(now).getFullYear();
  let thisMonth = 0;
  let lastMonth = 0;
  for (const w of weeks) {
    const d = new Date(w.weekStart);
    if (d.getFullYear() === thisYear && d.getMonth() === thisMonthKey) {
      thisMonth += w.sessions;
    } else if (
      (d.getFullYear() === thisYear && d.getMonth() === thisMonthKey - 1) ||
      (thisMonthKey === 0 && d.getFullYear() === thisYear - 1 && d.getMonth() === 11)
    ) {
      lastMonth += w.sessions;
    }
  }
  if (lastMonth <= 0) return null;
  const remaining = Math.max(0, lastMonth + 1 - thisMonth);
  if (remaining <= 0) return null;
  return { remaining, lastMonthSessions: lastMonth };
}

/** Rank and filter Home promo/context cards. Returns at most `maxCards` items. */
export function buildHomeContextCards(input: HomeContextInput, maxCards = 2): HomeContextCard[] {
  const now = input.now ?? Date.now();
  const stats = input.stats;
  const minSessions = input.minSessionsForContext ?? 3;
  const hasData = (stats?.totalSessions ?? 0) >= minSessions;
  const cards: HomeContextCard[] = [];

  if (hasData && isEarlyMonth(now) && lastMonthHadSessions(stats!, now)) {
    const lastMonthStartMs = previousMonthStart(now);
    const monthLabel = formatMonthLabel(lastMonthStartMs);
    const dismissKey = `report-month-${monthKey(lastMonthStartMs)}`;
    if (!input.dismissedAnnouncementIds.includes(dismissKey)) {
      cards.push({
        id: 'report-month',
        kind: 'report_month',
        priority: 8,
        title: `Your ${monthLabel} monthly report is ready!`,
        subtitle: 'Overview of workouts, PRs, and how your training shifted vs last month.',
        href: `/(app)/report/month?monthStartMs=${lastMonthStartMs}`,
        dismissKey,
        icon: 'calendar',
      });
    }
  }

  if (hasData && isMondayLocal(now)) {
    const prevWeek = stats!.weeklyVolume.length > 1 ? stats!.weeklyVolume[stats!.weeklyVolume.length - 2] : null;
    if ((prevWeek?.sessions ?? 0) > 0) {
      const lastWeekStartMs = startOfWeek(now) - WEEK_MS;
      cards.push({
        id: 'report-week',
        kind: 'report_week',
        priority: 11,
        title: 'Your week',
        subtitle: `${prevWeek!.sessions} session${prevWeek!.sessions === 1 ? '' : 's'} · ${formatVolume(prevWeek!.volume, input.unit)} last week`,
        href: `/(app)/report/week?weekStartMs=${lastWeekStartMs}`,
        icon: 'sparkles',
      });
    }
  }

  const inactiveDays = daysSince(stats?.lastSessionAt, now);
  if (hasData && inactiveDays != null && inactiveDays >= 4) {
    cards.push({
      id: 'inactivity',
      kind: 'inactivity',
      priority: 20,
      title: 'Time to train',
      subtitle:
        inactiveDays === 1
          ? 'Last workout was yesterday'
          : `Last workout ${inactiveDays} days ago`,
      icon: 'flame',
    });
  }

  if (hasData && input.weeklyGoal > 0 && !input.goalMet && input.sessionsToGoal > 0) {
    cards.push({
      id: 'weekly-goal',
      kind: 'weekly_goal',
      priority: 25,
      title: 'Weekly goal',
      subtitle: `${input.sessionsToGoal} more session${input.sessionsToGoal === 1 ? '' : 's'} to hit ${input.weeklyGoal}× this week`,
      href: '/(app)/calendar',
      icon: 'target',
    });
  }

  if (hasData && stats) {
    const monthTarget = monthSessionTarget(stats, now);
    if (monthTarget) {
      cards.push({
        id: 'month-target',
        kind: 'month_target',
        priority: 26,
        title: 'Beat last month',
        subtitle: `${monthTarget.remaining} more workout${monthTarget.remaining === 1 ? '' : 's'} to pass ${monthTarget.lastMonthSessions} sessions`,
        href: '/(app)/calendar',
        icon: 'trend',
      });
    }
  }

  if (hasData && input.prNudge) {
    const { exerciseName, weight, reps, templateId } = input.prNudge;
    cards.push({
      id: 'pr-nudge',
      kind: 'pr_nudge',
      priority: 30,
      title: `${exerciseName} PR?`,
      subtitle: `Last time ${weight} × ${reps} — ready to push?`,
      href: templateId ? `/workout/${templateId}` : undefined,
      icon: 'trophy',
    });
  }

  if (hasData && input.coachingTitle && input.coachingSubtitle) {
    cards.push({
      id: 'coaching',
      kind: 'coaching',
      priority: 35,
      title: input.coachingTitle,
      subtitle: input.coachingSubtitle,
      href: input.coachingHref ?? undefined,
      icon: 'trend',
    });
  }

  for (const ann of input.announcements) {
    if (input.dismissedAnnouncementIds.includes(ann.id)) continue;
    if (ann.startsAt && now < ann.startsAt) continue;
    if (ann.endsAt && now > ann.endsAt) continue;
    cards.push({
      id: `ann-${ann.id}`,
      kind: 'announcement',
      priority: 50,
      title: ann.title,
      subtitle: ann.subtitle,
      href: ann.href,
      dismissKey: ann.id,
      icon: 'megaphone',
    });
  }

  // Suppress duplicate report promos when both would show — keep month over week in early month
  const hasMonth = cards.some((c) => c.kind === 'report_month');
  const filtered = hasMonth ? cards.filter((c) => c.kind !== 'report_week') : cards;

  return filtered.sort((a, b) => a.priority - b.priority).slice(0, maxCards);
}

/** True when ranked cards are the same content (avoids Home remount flicker). */
export function sameHomeContextCards(a: HomeContextCard[], b: HomeContextCard[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id ||
      left.title !== right.title ||
      left.subtitle !== right.subtitle ||
      left.href !== right.href
    ) {
      return false;
    }
  }
  return true;
}

/** Caption line under the greeting — reuses week insight when relevant. */
export function homeWeekCaption(
  stats: ProgressStats | null | undefined,
  unit: Unit,
  minSessions = 3,
): string | null {
  if ((stats?.totalSessions ?? 0) < minSessions) return null;
  return weekInsightFromStats(stats, unit)?.line ?? null;
}
