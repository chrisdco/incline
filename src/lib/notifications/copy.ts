/**
 * Reminder copy helpers. RN-free so unit tests can import them without
 * pulling in react-native (see reminders.ts for the scheduler).
 */

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** "Tuesday session — ready when you are." Beats the old generic line. */
export function reminderBodyForDay(jsDay: number): string {
  const name = WEEKDAY_NAMES[jsDay] ?? 'Workout';
  return `${name} session — ready when you are.`;
}
