/**
 * "This week" widget snapshot (2x2).
 *
 * One job: how many sessions are logged against the weekly goal. Streak and
 * next-workout context live on the NextUp widget instead of crowding this one.
 */
import { plural, type WidgetPalettes } from './types';

export interface ThisWeekProps extends WidgetPalettes {
  eyebrow: string;
  count: string;
  goalLabel: string;
  progress: number;
  showProgress: boolean;
  footer: string;
}

export interface ThisWeekInput extends WidgetPalettes {
  sessionsThisWeek: number;
  weeklyGoal: number;
  sessionsToGoal: number;
  goalMet: boolean;
}

export function buildThisWeekProps(input: ThisWeekInput): ThisWeekProps {
  const { sessionsThisWeek, weeklyGoal, sessionsToGoal, goalMet } = input;

  const goal = Math.max(0, weeklyGoal);
  const showProgress = goal > 0;
  const progress = showProgress ? Math.min(1, sessionsThisWeek / goal) : 0;

  let footer: string;
  if (!showProgress) {
    footer = `${sessionsThisWeek} ${plural(sessionsThisWeek, 'session')} logged`;
  } else if (goalMet) {
    footer = 'Goal met this week';
  } else {
    footer = `${sessionsToGoal} ${plural(sessionsToGoal, 'session')} to go`;
  }

  return {
    eyebrow: 'THIS WEEK',
    count: String(sessionsThisWeek),
    goalLabel: showProgress ? `/${goal}` : '',
    progress,
    showProgress,
    footer,
    light: input.light,
    dark: input.dark,
  };
}
