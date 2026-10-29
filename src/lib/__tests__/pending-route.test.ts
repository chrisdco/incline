import { describe, expect, it } from 'vitest';

import { createPendingRoute, isAppRouteReady } from '@/lib/notifications/pending-route';

describe('pending notification route (#151)', () => {
  it('holds a cold-start tap until the gate lands in the app', () => {
    const pushed: string[] = [];
    const nav = createPendingRoute((p) => pushed.push(p));
    // Cold start: the last response is read before the gate has routed.
    nav.navigate('/session/7');
    expect(pushed).toEqual([]);
    expect(nav.peek()).toBe('/session/7');
    // Gate replaces "/" with (app)/(tabs).
    nav.setReady(isAppRouteReady(['(app)', '(tabs)']));
    expect(pushed).toEqual(['/session/7']);
    expect(nav.peek()).toBeNull();
  });

  it('pushes immediately once ready and never replays a flushed tap', () => {
    const pushed: string[] = [];
    const nav = createPendingRoute((p) => pushed.push(p));
    nav.setReady(true);
    nav.navigate('/(app)/report/week');
    nav.setReady(false);
    nav.setReady(true);
    expect(pushed).toEqual(['/(app)/report/week']);
  });

  it('keeps only the latest tap while waiting', () => {
    const pushed: string[] = [];
    const nav = createPendingRoute((p) => pushed.push(p));
    nav.navigate('/session/1');
    nav.navigate('/summary/1');
    nav.setReady(true);
    expect(pushed).toEqual(['/summary/1']);
  });

  it('treats the gate, auth and onboarding as not ready', () => {
    expect(isAppRouteReady([])).toBe(false);
    expect(isAppRouteReady(['(auth)', 'sign-in'])).toBe(false);
    expect(isAppRouteReady(['(onboarding)'])).toBe(false);
    expect(isAppRouteReady(['(app)', '(tabs)'])).toBe(true);
    expect(isAppRouteReady(['session', '[id]'])).toBe(true);
  });
});
