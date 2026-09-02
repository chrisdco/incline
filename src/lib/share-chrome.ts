export type ShareBackgroundId = 'ink' | 'navy' | 'forest' | 'slate';

export const SHARE_BACKGROUNDS: {
  id: ShareBackgroundId;
  label: string;
  card: string;
  page: string;
}[] = [
  { id: 'ink', label: 'Ink', card: '#151a24', page: '#0c0c0e' },
  { id: 'navy', label: 'Navy', card: '#16324f', page: '#0a1624' },
  { id: 'forest', label: 'Forest', card: '#14332c', page: '#0b1614' },
  { id: 'slate', label: 'Slate', card: '#1c1c22', page: '#0c0c0e' },
];

export function shareBackgroundById(id: ShareBackgroundId) {
  return SHARE_BACKGROUNDS.find((b) => b.id === id) ?? SHARE_BACKGROUNDS[0];
}

export function nextShareBackgroundId(id: ShareBackgroundId): ShareBackgroundId {
  const i = SHARE_BACKGROUNDS.findIndex((b) => b.id === id);
  const next = SHARE_BACKGROUNDS[(i + 1) % SHARE_BACKGROUNDS.length];
  return next.id;
}

export function shareHandleFromName(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  return slug ? `@${slug}` : '@incline';
}
