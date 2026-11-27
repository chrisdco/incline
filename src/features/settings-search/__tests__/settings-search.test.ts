import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SETTINGS, searchSettings } from '../index';

const ids = (q: string) => [...searchSettings(q).visible];

describe('settings search', () => {
  it('shows every on-screen setting with no query', () => {
    expect(searchSettings('').visible.size).toBe(SETTINGS.filter((s) => !s.route).length);
  });

  it('finds by title, keyword and synonym', () => {
    expect(ids('units')).toContain('units');
    expect(ids('kg')).toEqual(['units']);
    expect(ids('dark')).toContain('mode');
    expect(ids('log out')).toEqual(['sign-out']);
  });

  it('every token must match', () => {
    expect(ids('rest alerts')).toContain('rest-alerts');
    expect(ids('rest alerts')).not.toContain('default-rest');
  });

  it('tolerates one typo in longer words', () => {
    expect(ids('haptic')).toContain('haptics');
    expect(ids('vibratoin')).toEqual([]);
    expect(ids('notifcations')).toContain('notifications');
  });

  it('settings on other screens come back as routes', () => {
    const r = searchSettings('digest');
    expect(r.elsewhere.map((e) => e.id)).toEqual(['n-digest']);
    expect(r.elsewhere[0].route).toBe('/(app)/notifications');
  });

  it('says when nothing matches', () => {
    expect(searchSettings('zzzz').empty).toBe(true);
  });

  it('ids are unique', () => {
    expect(new Set(SETTINGS.map((s) => s.id)).size).toBe(SETTINGS.length);
  });

  it('every on-screen id is used by the Settings screen (and nothing unregistered is)', () => {
    const src = ['../../../app/(app)/settings.tsx', '../../../components/account/account-section.tsx'].map((f) => readFileSync(join(__dirname, f), 'utf8')).join('\n');
    const used = new Set([...src.matchAll(/\bshow\('([a-z0-9-]+)'\)/g)].map((m) => m[1]));
    const onScreen = SETTINGS.filter((s) => !s.route).map((s) => s.id);
    for (const id of onScreen) expect(used, `settings.tsx never renders ${id}`).toContain(id);
    for (const id of used) expect(onScreen, `${id} is not in the registry`).toContain(id);
  });
});
