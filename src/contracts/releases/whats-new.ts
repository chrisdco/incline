/**
 * What's new (docs/decisions/RELEASES.md, ASK-UI.md "What's new sheet").
 *
 * One pack every surface reads: the app's What's new carousel, the web
 * dashboard and the release feed (app-release fills each build's notes with
 * the items added since the previous build). An item ships in the same
 * change as its feature, so the app never announces something it lacks.
 */

/** Icon keys each surface maps to its own icon set (lucide on app and web). */
export type WhatsNewIcon = 'trending' | 'heart' | 'mic' | 'share' | 'widget' | 'sparkles' | 'sign_in' | 'shield';

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
}

/** Newest first. Keep titles short (they head a card). */
export const WHATS_NEW: readonly WhatsNewItem[] = [
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
    bullets: ['Read only: Incline never writes to it', 'Readiness on Home', 'Ask can use it in answers'],
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

/** Items the user has not seen, newest first, capped so the carousel stays short. */
export function unseenWhatsNew(seenIds: readonly string[], pack: readonly WhatsNewItem[] = WHATS_NEW, max = 5): WhatsNewItem[] {
  const seen = new Set(seenIds);
  return [...pack]
    .filter((i) => !seen.has(i.id))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    .slice(0, max);
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
