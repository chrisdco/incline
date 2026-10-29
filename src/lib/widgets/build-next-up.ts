/**
 * "Next workout" widget snapshot (4x2).
 *
 * One job: what should I train next? Precedence mirrors the Home hero —
 * an in-progress session wins, then today's program slot, then the suggested
 * template, then an empty ready state.
 */
import { WIDGET_LINKS } from './build-extra';
import { formatElapsed, formatUpdatedAt, plural, type WidgetPalettes } from './types';

export interface NextUpProps extends WidgetPalettes {
  eyebrow: string;
  title: string;
  detail: string;
  /** Rendered as a pill next to the eyebrow when present. */
  streakLabel: string | null;
  footer: string;
  /** Right-hand stat column: this week's volume vs last week. */
  volume: string;
  /** "▲ 2.1k kg" / "▼ 302 kg" vs last week; null without last-week data. */
  volumeDelta: string | null;
  volumeUp: boolean;
  /** Deep link the card opens: the running session, else Home. */
  url: string;
}

export interface NextUpInput extends WidgetPalettes {
  activeSession: { id?: number; name: string; startedAt: number } | null;
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
  /** Working volume in kg. */
  volumeThisWeek: number;
  volumeLastWeek: number;
  formatVolume: (kg: number) => string;
}

export function buildNextUpProps(input: NextUpInput): NextUpProps {
  const { activeSession, today, suggested, sessionsThisWeek, weeklyGoal, streak, now } = input;

  let eyebrow = 'Ready';
  let title = 'Start a workout';
  let detail = 'No active program yet';

  if (activeSession) {
    eyebrow = 'In progress';
    title = activeSession.name;
    const elapsed = formatElapsed(activeSession.startedAt, now);
    detail = elapsed === 'just now' ? 'Started just now' : `Started ${elapsed} ago`;
  } else if (today) {
    eyebrow = 'Today';
    title = today.templateName;
    detail = `Week ${today.week}${today.estimatedMinutes ? ` · ${today.estimatedMinutes} min` : ''}`;
  } else if (suggested) {
    eyebrow = 'Suggested';
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
    volume: input.formatVolume(input.volumeThisWeek),
    volumeDelta:
      input.volumeLastWeek > 0
        ? `${input.volumeThisWeek >= input.volumeLastWeek ? '▲' : '▼'} ${input.formatVolume(Math.abs(input.volumeThisWeek - input.volumeLastWeek))}`
        : null,
    volumeUp: input.volumeThisWeek >= input.volumeLastWeek,
    url: activeSession?.id != null ? WIDGET_LINKS.session(activeSession.id) : WIDGET_LINKS.home,
    light: input.light,
    dark: input.dark,
  };
}
