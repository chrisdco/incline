/**
 * "This week" widget snapshot (2x2).
 *
 * Reference (Hevy "Last workouts" / Lyfta streak calendar): one headline
 * number, then a Mon–Sun strip with trained days filled and today ringed.
 * Glanceable without reading — the dots carry the week.
 */
import { plural, type WidgetPalettes } from './types';

export interface WidgetDay {
  letter: string;
  trained: boolean;
  isToday: boolean;
}

export interface ThisWeekProps extends WidgetPalettes {
  eyebrow: string;
  count: string;
  /** "workouts" / "of 4 workouts". */
  countLabel: string;
  days: WidgetDay[];
  footer: string;
}

export interface ThisWeekInput extends WidgetPalettes {
  sessionsThisWeek: number;
  weeklyGoal: number;
  sessionsToGoal: number;
  goalMet: boolean;
  trainedDays: boolean[];
  todayIndex: number;
}

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function buildThisWeekProps(input: ThisWeekInput): ThisWeekProps {
  const { sessionsThisWeek, weeklyGoal, sessionsToGoal, goalMet } = input;
  const goal = Math.max(0, weeklyGoal);
  const noun = plural(goal > 0 ? goal : sessionsThisWeek, 'workout');

  let footer: string;
  if (goal === 0) footer = 'No weekly goal set';
  else if (goalMet) footer = 'Goal met';
  else footer = `${sessionsToGoal} to go`;

  return {
    eyebrow: 'This week',
    count: String(sessionsThisWeek),
    countLabel: goal > 0 ? `of ${goal} ${noun}` : noun,
    days: LETTERS.map((letter, i) => ({
      letter,
      trained: input.trainedDays[i] ?? false,
      isToday: i === input.todayIndex,
    })),
    footer,
    light: input.light,
    dark: input.dark,
  };
}
