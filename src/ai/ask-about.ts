import type { Href } from 'expo-router';

import { ABOUT_KINDS, type AboutKind, type ContextPart } from '@/contracts/ai/chat';
import { newUuid } from '@/lib/uuid';

/**
 * "Ask about this" (ASK-UI.md Phase 2): any card or screen opens a new Ask
 * thread with the thing attached. The attachment is a pointer (kind, name,
 * our id); the model reads the numbers with its tools.
 */

/** The opening question when the user didn't type one. */
export function defaultAboutQuestion(about: ContextPart): string {
  switch (about.kind) {
    case 'exercise':
      return `How is my ${about.label} going?`;
    case 'workout':
      return 'How did this workout go?';
    case 'routine':
      return 'Is this routine balanced for me?';
    case 'insight':
      return 'Tell me more about this.';
  }
}

export function askAboutHref(about: ContextPart, question = defaultAboutQuestion(about)): Href {
  const params = new URLSearchParams({ q: question, aboutKind: about.kind, aboutLabel: about.label });
  if (about.ref) params.set('aboutRef', about.ref);
  return `/(app)/chat/${newUuid()}?${params.toString()}` as Href;
}

/** Route params → a validated attachment, or null. Params are untrusted (deep links). */
export function aboutFromParams(p: { aboutKind?: string; aboutLabel?: string; aboutRef?: string }): ContextPart | null {
  const kind = p.aboutKind as AboutKind | undefined;
  const label = p.aboutLabel?.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!kind || !ABOUT_KINDS.includes(kind) || !label) return null;
  const ref = p.aboutRef && /^[\w-]{1,40}$/.test(p.aboutRef) ? p.aboutRef : undefined;
  return { type: 'context', kind, label, ...(ref ? { ref } : {}) };
}
