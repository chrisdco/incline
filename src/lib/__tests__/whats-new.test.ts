import { describe, expect, it } from 'vitest';

import { notesForBuild, unseenWhatsNew, WHATS_NEW, type WhatsNewItem } from '@/contracts/releases/whats-new';

const item = (id: string, addedAt: string): WhatsNewItem => ({ id, addedAt, icon: 'sparkles', title: id, body: id });
const pack = [item('a', '2026-11-01'), item('c', '2026-11-20'), item('b', '2026-11-10')];

describe('whats new', () => {
  it('ids are unique and bodies stay short', () => {
    expect(new Set(WHATS_NEW.map((i) => i.id)).size).toBe(WHATS_NEW.length);
    for (const i of WHATS_NEW) {
      expect(i.title.length).toBeLessThanOrEqual(40);
      expect(i.body.length).toBeLessThanOrEqual(200);
      expect(i.bullets?.length ?? 0).toBeLessThanOrEqual(3);
      expect(Number.isNaN(Date.parse(i.addedAt))).toBe(false);
    }
  });

  it('unseen is newest first, skips seen, caps the carousel', () => {
    expect(unseenWhatsNew(['b'], pack).map((i) => i.id)).toEqual(['c', 'a']);
    expect(unseenWhatsNew([], pack, 2).map((i) => i.id)).toEqual(['c', 'b']);
    expect(unseenWhatsNew(['a', 'b', 'c'], pack)).toEqual([]);
  });

  it('build notes are the items between the previous build and this one', () => {
    const at = (d: string) => Date.parse(`${d}T12:00:00Z`);
    expect(notesForBuild(at('2026-11-05'), at('2026-11-18'), pack).map((n) => n.id)).toEqual(['b']);
    expect(notesForBuild(null, at('2026-11-18'), pack).map((n) => n.id)).toEqual(['b', 'a']);
    expect(notesForBuild(at('2026-11-18'), at('2026-11-19'), pack)).toEqual([]);
  });
});
