/**
 * "Next workout" widget snapshot (4x2).
 *
 * One job: what should I train next? Precedence mirrors the Home hero —
 * an in-progress session wins, then today's program slot, then the suggested
 * template, then an empty ready state.
 */
import { formatElapsed, formatUpdatedAt, plural, type WidgetPalettes } from './types';

export interface NextUpProps extends WidgetPalettes {
  eyebrow: string;
  title: string;
  detail: string;
  /** Rendered as a pill next to the eyebrow when present. */
  streakLabel: string | null;
  footer: string;
}

export interface NextUpInput extends WidgetPalettes {
  activeSession: { name: string; startedAt: number } | null;
  today: {
    templateName: string;
    week: number;
    estimatedMinutes: number | null;
  } | null;
  suggested: { name: string } | null;
  sessionsThisWeek: number;
  weeklyGoal: number;
  streak: number;
  now: number;
}

export function buildNextUpProps(input: NextUpInput): NextUpProps {
  const { activeSession, today, suggested, sessionsThisWeek, weeklyGoal, streak, now } = input;

  let eyebrow = 'READY';
  let title = 'Start a workout';
  let detail = 'No active program yet';

  if (activeSession) {
    eyebrow = 'IN PROGRESS';
    title = activeSession.name;
    const elapsed = formatElapsed(activeSession.startedAt, now);
    detail = elapsed === 'just now' ? 'Started just now' : `Started ${elapsed} ago`;
  } else if (today) {
    eyebrow = 'TODAY';
    title = today.templateName;
    detail = `Week ${today.week}${today.estimatedMinutes ? ` · ${today.estimatedMinutes} min` : ''}`;
  } else if (suggested) {
    eyebrow = 'SUGGESTED';
    title = suggested.name;
    detail = 'Based on your recent training';
  }

  const progress =
    weeklyGoal > 0
      ? `${sessionsThisWeek} of ${weeklyGoal} sessions`
      : `${sessionsThisWeek} ${plural(sessionsThisWeek, 'session')} this week`;

  return {
    eyebrow,
    title,
    detail,
    streakLabel: streak >= 2 ? `${streak}-week streak` : null,
    footer: `${progress} · ${formatUpdatedAt(now, now)}`,
    light: input.light,
    dark: input.dark,
  };
}
