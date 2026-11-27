/**
 * What's new (docs/decisions/RELEASES.md, ASK-UI.md "What's new sheet").
 *
 * One pack every surface reads: the app's What's new carousel, the web
 * dashboard and the release feed (app-release fills each build's notes with
 * the items added since the previous build). An item ships in the same
 * change as its feature, so the app never announces something it lacks.
 */

/** Icon keys each surface maps to its own icon set (lucide on app and web). */
export type WhatsNewIcon = 'trending' | 'heart' | 'mic' | 'share' | 'widget' | 'sparkles' | 'sign_in' | 'shield' | 'settings' | 'wrench';

/**
 * How loud an item is (issue #410). Fixes-only updates add nothing.
 * - `note`: a line in the changelog only, never a card or a dot;
 * - `announce` (default): a card in the What's new sheet plus a changelog line;
 * - `must-read`: a behaviour change or data migration; its card comes first.
 */
export type WhatsNewLevel = 'note' | 'announce' | 'must-read';

export interface WhatsNewItem {
  /** Stable; doubles as the seen flag. Never reuse an id. */
  id: string;
  /** ISO date the feature merged; orders the pack and splits it per build. */
  addedAt: string;
  icon: WhatsNewIcon;
  title: string;
  /** One sentence, plain words, what changes for the user. */
  body: string;
  /** Up to 3 short lines under the body. */
  bullets?: readonly string[];
  /** Expo Router path for "Try it" (app). */
  href?: string;
  /** Button label for href; default "Try it". */
  cta?: string;
  /** Needs a native build newer than the runtime it shipped in (shown on web as "in the latest build"). */
  native?: boolean;
  /** Default `announce`. */
  level?: WhatsNewLevel;
}

export function levelOf(item: WhatsNewItem): WhatsNewLevel {
  return item.level ?? 'announce';
}

/** Newest first. Keep titles short (they head a card). */
export const WHATS_NEW: readonly WhatsNewItem[] = [
  {
    id: 'health-write-v1',
    addedAt: '2026-11-27',
    icon: 'heart',
    title: 'Workouts in Health Connect',
    body: 'Turn on Save workouts and each finished session lands in Health Connect as strength training, so Samsung Health and Fit see it too.',
    bullets: ['Edits and deletes follow', 'Calories and protein you log elsewhere show on the Health screen', 'Ask can use them, if you allow'],
    href: '/(app)/health',
    cta: 'Open Health',
    native: true,
  },
  {
    id: 'abandoned-ping-v2',
    addedAt: '2026-11-27',
    icon: 'wrench',
    level: 'note',
    title: 'A nudge if you leave a workout open',
    body: 'With the Abandoned session nudge on, Incline pings you 25 minutes after your last set even if you closed the app.',
  },
  {
    id: 'health-status-v1',
    addedAt: '2026-11-27',
    icon: 'heart',
    level: 'note',
    title: 'Health says what it’s waiting for',
    body: 'Home and the Health screen now show which types arrive from Health Connect and how many days until readiness compares to your usual.',
  },
  {
    id: 'settings-search-v1',
    addedAt: '2026-11-27',
    icon: 'settings',
    title: 'Search your settings',
    body: 'Type in Settings to find any option, even by another word: “kg” finds Units, “dark” finds Light or dark.',
    bullets: ['Settings is now the gear on Profile', 'Sign out and Delete account live under Account'],
    href: '/(app)/settings',
    cta: 'Open Settings',
  },
  {
    id: 'version-share-v1',
    addedAt: '2026-11-27',
    icon: 'wrench',
    level: 'note',
    title: 'Share your version details',
    body: 'Tap Version in Settings → About to send exactly which build and update you run.',
  },
  {
    id: 'fix-workout-not-found',
    addedAt: '2026-11-27',
    icon: 'wrench',
    level: 'note',
    title: 'Suggested workouts open first time',
    body: 'Starting a workout from the Home suggestion no longer flashes “Workout not found”.',
  },
  {
    id: 'plateau-v1',
    addedAt: '2026-11-18',
    icon: 'trending',
    title: 'Stuck lifts get a plan',
    body: 'When a lift stops moving for 4 sessions, Incline says why and offers a fix: reset the load, add a set, change reps or swap.',
    bullets: [
      'Every fix shows its evidence and can be undone',
      'Suggestions from Ask or Claude sit next to Incline’s',
      'Choose Ask first, Auto small fixes or Off in Settings',
    ],
    href: '/(app)/(tabs)/progress',
    cta: 'See Progress',
  },
  {
    id: 'health-v1',
    addedAt: '2026-11-16',
    icon: 'heart',
    title: 'Sleep and recovery',
    body: 'Connect Health Connect (and Samsung Health through it) to see sleep, resting heart rate and HRV next to your training.',
    bullets: ['Each type is your choice, and you can stop sharing any time', 'Readiness on Home', 'Ask can use it in answers'],
    href: '/(app)/health',
    cta: 'Connect',
    native: true,
  },
  {
    id: 'voice-v1',
    addedAt: '2026-11-16',
    icon: 'mic',
    title: 'Talk to Ask',
    body: 'Hold the mic in Ask and speak your question. Recognition runs on the phone where it can.',
    href: '/(app)/ai',
    cta: 'Try Ask',
    native: true,
  },
  {
    id: 'share-v2',
    addedAt: '2026-11-16',
    icon: 'share',
    title: 'Better workout cards',
    body: 'Share a square card with a caption, or save it straight to Photos.',
    native: true,
  },
  {
    id: 'widgets-v2',
    addedAt: '2026-11-16',
    icon: 'widget',
    title: 'Widgets that resize',
    body: 'Home-screen widgets adapt to their size, and long-press the app icon to start a workout.',
    native: true,
  },
  {
    id: 'ask-v1',
    addedAt: '2026-11-12',
    icon: 'sparkles',
    title: 'Ask about your training',
    body: 'Ask how a lift is trending, which muscles you undertrain, or what to do next. Every answer shows what it read.',
    bullets: ['Chats stay on this device', 'Ask reads your workouts; it never changes them'],
    href: '/(app)/ai',
    cta: 'Try Ask',
  },
];

const newestFirst = (a: WhatsNewItem, b: WhatsNewItem) => b.addedAt.localeCompare(a.addedAt);

/**
 * Cards the user has not seen: must-read first, then newest. Notes never
 * become cards. Capped so the carousel stays short.
 */
export function unseenWhatsNew(seenIds: readonly string[], pack: readonly WhatsNewItem[] = WHATS_NEW, max = 5): WhatsNewItem[] {
  const seen = new Set(seenIds);
  const rank = (i: WhatsNewItem) => (levelOf(i) === 'must-read' ? 0 : 1);
  return [...pack]
    .filter((i) => !seen.has(i.id) && levelOf(i) !== 'note')
    .sort((a, b) => rank(a) - rank(b) || newestFirst(a, b))
    .slice(0, max);
}

/** How long an unseen card keeps its New dot, and how many dots at once. */
export const NEW_DOT_DAYS = 7;
export const NEW_DOT_MAX = 2;

/**
 * Items that get a New dot (RELEASES.md, "without noise"): cards (not notes)
 * from the newest day in the pack, unseen, added within NEW_DOT_DAYS, at most
 * NEW_DOT_MAX. Opening the changelog marks them seen.
 */
export function newDotIds(seenIds: readonly string[], now: number, pack: readonly WhatsNewItem[] = WHATS_NEW): string[] {
  const sorted = [...pack].sort(newestFirst);
  const newest = sorted[0]?.addedAt;
  if (!newest) return [];
  const seen = new Set(seenIds);
  const cutoff = now - NEW_DOT_DAYS * 86_400_000;
  return sorted
    .filter((i) => i.addedAt === newest && levelOf(i) !== 'note' && !seen.has(i.id) && Date.parse(`${i.addedAt}T00:00:00Z`) >= cutoff)
    .slice(0, NEW_DOT_MAX)
    .map((i) => i.id);
}

export interface ChangelogDay {
  /** ISO date. */
  date: string;
  /** Cards (must-read first), then notes. */
  items: WhatsNewItem[];
}

/** The browsable history: one group per day, newest first. Same on app and web. */
export function changelog(pack: readonly WhatsNewItem[] = WHATS_NEW): ChangelogDay[] {
  const order = { 'must-read': 0, announce: 1, note: 2 } as const;
  const days = new Map<string, WhatsNewItem[]>();
  for (const i of [...pack].sort(newestFirst)) {
    const list = days.get(i.addedAt) ?? [];
    list.push(i);
    days.set(i.addedAt, list);
  }
  return [...days].map(([date, items]) => ({
    date,
    items: items.sort((a, b) => order[levelOf(a)] - order[levelOf(b)]),
  }));
}

/** A build's notes: items added after the previous build, newest first. */
export function notesForBuild(
  previousBuildAt: number | null,
  buildAt: number,
  pack: readonly WhatsNewItem[] = WHATS_NEW,
): { id: string; title: string; body: string; icon: WhatsNewIcon }[] {
  return pack
    .filter((i) => {
      const t = Date.parse(`${i.addedAt}T00:00:00Z`);
      return (previousBuildAt == null || t > previousBuildAt) && t <= buildAt;
    })
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    .map(({ id, title, body, icon }) => ({ id, title, body, icon }));
}
