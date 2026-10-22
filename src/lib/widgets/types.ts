/**
 * Shared shape for the Android home-screen widgets.
 *
 * The widget runtime is isolated: no hooks, no timers, no module-scope values,
 * and on Android `environment` only carries `colorScheme`. Everything a layout
 * renders — copy, numbers and *both* colour palettes — therefore arrives in
 * props. Snapshot builders stay pure (`build-next-up.ts` / `build-this-week.ts`)
 * so formatting is unit-tested here instead of being duplicated inside the
 * widget bundle, and the widget only picks a palette.
 */

export interface WidgetPalette {
  background: string;
  card: string;
  foreground: string;
  muted: string;
  primary: string;
  border: string;
}

export interface WidgetPalettes {
  light: WidgetPalette;
  dark: WidgetPalette;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/**
 * Absolute "updated" stamp. A relative label ("2h ago") would silently rot —
 * widgets cannot recompute — so stay truthful: time only while it is still
 * today, weekday + time later this year, date beyond that.
 */
export function formatUpdatedAt(at: number, now: number): string {
  const date = new Date(at);
  const current = new Date(now);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const sameDay =
    date.getFullYear() === current.getFullYear() &&
    date.getMonth() === current.getMonth() &&
    date.getDate() === current.getDate();
  if (sameDay) return `Updated ${time}`;
  if (date.getFullYear() === current.getFullYear()) {
    return `Updated ${WEEKDAYS[date.getDay()]} ${time}`;
  }
  return `Updated ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "just now" / "12 min" / "1h 05m" — used for an in-progress session. */
export function formatElapsed(startedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${pad(minutes % 60)}m`;
}
