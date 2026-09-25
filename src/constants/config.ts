/** App-wide constants. Storage keys live here as the single source of truth. */
export const DB_NAME = 'incline.db';

export const APP = {
  name: 'Incline',
  tagline: 'Train with intent',
} as const;

export const PAGINATION = {
  /** Number of history rows fetched per page (infinite scroll). */
  pageSize: 20,
} as const;

/** Zustand persist keys (stored in the SQLite kv table). */
export const STORAGE_KEYS = {
  settings: 'settings',
  activeWorkout: 'active-workout',
} as const;

/**
 * Account deletion with a 30-day grace period (docs/ACCOUNT-DELETION.md).
 * Shipped dark: entry points and the gate check stay dormant until this is
 * true. Flip when the app goes to real users — no other code changes needed.
 */
export const ACCOUNT_DELETION_ENABLED = false;

/**
 * Placeholder text colour for native `TextInput`s. These cannot use Tailwind
 * classes, so they need one shared value — screens previously drifted between
 * three different greys (#6b7280 / #9ca3af / #71717a).
 */
export const PLACEHOLDER_COLOR = '#71717a';
