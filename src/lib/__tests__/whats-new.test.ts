import { describe, expect, it } from 'vitest';

import { changelog, newDotIds, notesForBuild, unseenWhatsNew, WHATS_NEW, type WhatsNewItem, type WhatsNewLevel } from '@/contracts/releases/whats-new';

const item = (id: string, addedAt: string, level?: WhatsNewLevel): WhatsNewItem => ({ id, addedAt, icon: 'sparkles', title: id, body: id, level });
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

  it('notes never become cards; must-read comes first', () => {
    const p = [item('n', '2026-11-25', 'note'), item('a', '2026-11-24'), item('m', '2026-11-20', 'must-read')];
    expect(unseenWhatsNew([], p).map((i) => i.id)).toEqual(['m', 'a']);
  });

  it('New dot: newest day only, unseen cards, 7 days, at most 2', () => {
    const now = Date.parse('2026-11-27T12:00:00Z');
    const p = [
      item('x', '2026-11-27'),
      item('y', '2026-11-27'),
      item('z', '2026-11-27'),
      item('n', '2026-11-27', 'note'),
      item('old', '2026-11-20'),
    ];
    expect(newDotIds([], now, p)).toEqual(['x', 'y']);
    expect(newDotIds(['x'], now, p)).toEqual(['y', 'z']);
    expect(newDotIds([], Date.parse('2026-12-10T00:00:00Z'), p)).toEqual([]);
    expect(newDotIds([], now, [item('n', '2026-11-27', 'note')])).toEqual([]);
  });

  it('changelog groups by day, newest first, cards before notes', () => {
    const p = [item('n', '2026-11-27', 'note'), item('a', '2026-11-27'), item('b', '2026-11-10')];
    expect(changelog(p)).toEqual([
      { date: '2026-11-27', items: [p[1], p[0]] },
      { date: '2026-11-10', items: [p[2]] },
    ]);
  });
});
