/**
 * Settings search (WORK-QUEUE Build 3, 1a).
 *
 * One registry for every setting: the Settings screen renders a row only when
 * its id is visible, and search filters the same list, so a new setting that
 * isn't registered here fails the coverage test instead of being unsearchable.
 * Matching is in memory over ~50 entries, cheap enough to run on each keystroke.
 *
 * `route` entries live on another screen (Notifications, AI, Health,
 * Appearance); they show as "In <screen>" results that open that screen.
 */

export interface SettingEntry {
  id: string;
  title: string;
  /** Section on the Settings screen, or the screen a `route` entry lives on. */
  section: string;
  /** Other words people use for it ("kg" for Units, "dark" for Appearance). */
  keywords?: readonly string[];
  /** Lives on another screen: the result opens it. */
  route?: string;
}

const NOTIFS = '/(app)/notifications';
const AI = '/(app)/ai-settings';
const HEALTH = '/(app)/health';
const LOOK = '/(app)/appearance';

export const SETTINGS: readonly SettingEntry[] = [
  { id: 'mode', title: 'Light or dark', section: 'Appearance', keywords: ['dark mode', 'light mode', 'night', 'system theme'] },
  { id: 'theme', title: 'Theme and accent', section: 'Appearance', keywords: ['colour', 'color', 'accent', 'aurora', 'theme'] },
  { id: 'units', title: 'Units', section: 'Basics', keywords: ['kg', 'lb', 'lbs', 'pounds', 'kilograms', 'metric', 'imperial', 'weight unit'] },
  { id: 'weekly-goal', title: 'Weekly workout goal', section: 'Basics', keywords: ['target', 'sessions per week', 'frequency', 'consistency'] },
  { id: 'week-start', title: 'Week starts on', section: 'Basics', keywords: ['monday', 'sunday', 'first day', 'calendar'] },
  { id: 'calendar-color', title: 'Calendar day color', section: 'Basics', keywords: ['colour', 'heatmap', 'tint', 'volume', 'intensity'] },
  { id: 'gyms', title: 'Gyms', section: 'Basics', keywords: ['location', 'equipment', 'home gym'] },
  { id: 'auto-rest', title: 'Auto-start rest timer', section: 'Rest timer', keywords: ['rest', 'timer', 'automatic', 'countdown'] },
  { id: 'default-rest', title: 'Default rest', section: 'Rest timer', keywords: ['rest time', 'seconds', 'break'] },
  { id: 'rest-alerts', title: 'Rest timer alerts', section: 'Rest timer', keywords: ['sound', 'chime', 'alarm', 'notify'] },
  { id: 'exact-alarms', title: 'Precise rest alerts', section: 'Rest timer', keywords: ['exact alarm', 'late', 'permission'] },
  { id: 'warmup-button', title: 'Warm-up set button', section: 'During a workout', keywords: ['warmup', 'warm up'] },
  { id: 'rpe', title: 'RPE after working sets', section: 'During a workout', keywords: ['effort', 'rir', 'difficulty', 'exertion'] },
  { id: 'ghost', title: 'Last-session comparison', section: 'During a workout', keywords: ['previous', 'last time', 'history', 'ghost'] },
  { id: 'dumbbell', title: 'Dumbbell weight', section: 'During a workout', keywords: ['per hand', 'pair', 'total', 'db'] },
  { id: 'keep-awake', title: 'Keep screen on', section: 'During a workout', keywords: ['awake', 'display', 'screen timeout', 'lock'] },
  { id: 'haptics', title: 'Haptics', section: 'During a workout', keywords: ['vibration', 'vibrate', 'feedback', 'buzz'] },
  { id: 'plateau', title: 'Plateau fixes', section: 'Coaching', keywords: ['progression', 'stuck', 'stall', 'deload', 'autonomy'] },
  { id: 'notifications', title: 'Notifications', section: 'Notifications, health and AI', keywords: ['alerts', 'push', 'reminders'] },
  { id: 'health', title: 'Health', section: 'Notifications, health and AI', keywords: ['health connect', 'samsung health', 'google fit', 'readiness'] },
  { id: 'ai', title: 'AI coaching', section: 'Notifications, health and AI', keywords: ['ask', 'claude', 'model', 'api key', 'byok', 'explanations'] },
  { id: 'demo-images', title: 'Demonstration images', section: 'Exercise demos', keywords: ['gif', 'illustration', 'media', 'exercise images'] },
  { id: 'demo-motion', title: 'Illustration motion', section: 'Exercise demos', keywords: ['animation', 'frames', 'reduce motion'] },
  { id: 'backup', title: 'Backup & restore', section: 'Backup', keywords: ['sync', 'cloud', 'restore', 'upload'] },
  { id: 'export', title: 'Download your data', section: 'Your data', keywords: ['export', 'csv', 'json', 'backup'] },
  { id: 'import', title: 'Import from Strong / Hevy', section: 'Your data', keywords: ['import', 'csv', 'strong', 'hevy', 'migrate'] },
  { id: 'photo-storage', title: 'Photo storage', section: 'Your data', keywords: ['photos', 'space', 'images'] },
  { id: 'clear-history', title: 'Clear workout history', section: 'Your data', keywords: ['delete workouts', 'reset', 'wipe'] },
  { id: 'delete-account', title: 'Delete account', section: 'Account', keywords: ['close account', 'remove account', 'erase'] },
  { id: 'sign-out', title: 'Sign out', section: 'Account', keywords: ['log out', 'logout', 'switch account'] },
  { id: 'version', title: 'Version', section: 'About', keywords: ['build', 'release', 'about'] },
  { id: 'updates', title: 'App updates', section: 'About', keywords: ['update', 'check for updates', 'ota', 'new version'] },

  // On other screens.
  { id: 'n-reminders', title: 'Workout reminders', section: 'Notifications', route: NOTIFS, keywords: ['remind', 'schedule'] },
  { id: 'n-digest', title: 'Sunday digest', section: 'Notifications', route: NOTIFS, keywords: ['weekly summary', 'week summary'] },
  { id: 'n-recap', title: 'Monthly recap', section: 'Notifications', route: NOTIFS, keywords: ['month summary'] },
  { id: 'n-abandoned', title: 'Abandoned session', section: 'Notifications', route: NOTIFS, keywords: ['idle', 'forgot to finish'] },
  { id: 'n-streak', title: 'Streak at risk', section: 'Notifications', route: NOTIFS, keywords: ['streak'] },
  { id: 'n-milestones', title: 'Milestones', section: 'Notifications', route: NOTIFS, keywords: ['achievements', 'congrats'] },
  { id: 'ai-data-use', title: 'AI data use', section: 'AI coaching', route: AI, keywords: ['privacy', 'what is sent'] },
  { id: 'ai-memory', title: 'What Incline knows', section: 'AI coaching', route: AI, keywords: ['memory', 'facts', 'remembers'] },
  { id: 'ai-mcp', title: 'Connect Claude and others', section: 'AI coaching', route: AI, keywords: ['mcp', 'chatgpt', 'integrations'] },
  { id: 'h-permissions', title: 'Manage permissions', section: 'Health', route: HEALTH, keywords: ['sleep', 'hrv', 'heart rate', 'steps', 'weight'] },
  { id: 'h-ask', title: 'Use in Ask', section: 'Health', route: HEALTH, keywords: ['share health with ai'] },
  { id: 'look-accent', title: 'Accent', section: 'Appearance', route: LOOK, keywords: ['colour', 'color', 'tint'] },
];

/** Lowercase, drop accents and punctuation, collapse spaces. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** At most one edit apart (typos like "hapitcs" stay out; "haptic" vs "haptics" is in). */
function nearlyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

interface Indexed {
  entry: SettingEntry;
  title: string;
  words: string[];
}

const INDEX: readonly Indexed[] = SETTINGS.map((entry) => {
  const title = norm(entry.title);
  const words = norm([entry.title, entry.section, ...(entry.keywords ?? [])].join(' ')).split(' ');
  return { entry, title, words };
});

/** 3 = title starts with the query, 2 = a word starts with each token, 1 = typo-tolerant. 0 = no match. */
function score(item: Indexed, q: string, tokens: readonly string[]): number {
  if (item.title.startsWith(q)) return 3;
  let total = 2;
  for (const t of tokens) {
    if (item.words.some((w) => w.startsWith(t))) continue;
    if (t.length >= 4 && item.words.some((w) => nearlyEqual(w, t))) {
      total = 1;
      continue;
    }
    return 0;
  }
  return total;
}

export interface SettingsSearchResult {
  /** Ids on the Settings screen that stay visible (in screen order). */
  visible: ReadonlySet<string>;
  /** Matches on other screens, best first. */
  elsewhere: readonly SettingEntry[];
  empty: boolean;
}

export function searchSettings(query: string, entries: readonly SettingEntry[] = SETTINGS): SettingsSearchResult {
  const q = norm(query);
  const items = entries === SETTINGS ? INDEX : entries.map((entry) => ({ entry, title: norm(entry.title), words: norm([entry.title, entry.section, ...(entry.keywords ?? [])].join(' ')).split(' ') }));
  if (!q) {
    return { visible: new Set(items.filter((i) => !i.entry.route).map((i) => i.entry.id)), elsewhere: [], empty: false };
  }
  const tokens = q.split(' ');
  const scored = items.map((i) => ({ i, s: score(i, q, tokens) })).filter((x) => x.s > 0);
  const visible = new Set(scored.filter((x) => !x.i.entry.route).map((x) => x.i.entry.id));
  const elsewhere = scored
    .filter((x) => x.i.entry.route)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.i.entry);
  return { visible, elsewhere, empty: scored.length === 0 };
}
