import { describe, expect, it } from 'vitest';

import { buildNextUpProps } from '@/lib/widgets/build-next-up';
import { buildThisWeekProps } from '@/lib/widgets/build-this-week';
import { formatElapsed, formatUpdatedAt, type WidgetPalettes } from '@/lib/widgets/types';

const palettes: WidgetPalettes = {
  light: {
    background: '#ffffff',
    card: '#f4f4f5',
    foreground: '#09090b',
    muted: '#62626a',
    primary: '#6D5DF6',
    border: '#e4e4e7',
  },
  dark: {
    background: '#0c0c0e',
    card: '#151519',
    foreground: '#fafafa',
    muted: '#afafb6',
    primary: '#8B7CFF',
    border: '#242428',
  },
};

const NOW = new Date(2026, 9, 22, 18, 40).getTime(); // Thu 22 Oct 2026, local

function nextUp(overrides: Partial<Parameters<typeof buildNextUpProps>[0]> = {}) {
  return buildNextUpProps({
    activeSession: null,
    today: null,
    suggested: null,
    sessionsThisWeek: 0,
    weeklyGoal: 4,
    streak: 0,
    now: NOW,
    ...palettes,
    ...overrides,
  });
}

describe('buildNextUpProps', () => {
  it('puts an in-progress session first', () => {
    const props = nextUp({
      activeSession: { name: 'Push A', startedAt: NOW - 24 * 60 * 1000 },
      today: { templateName: 'Pull B', week: 2, estimatedMinutes: 45 },
      suggested: { name: 'Legs' },
      sessionsThisWeek: 3,
      streak: 3,
    });

    expect(props.eyebrow).toBe('IN PROGRESS');
    expect(props.title).toBe('Push A');
    expect(props.detail).toBe('Started 24 min ago');
    expect(props.streakLabel).toBe('3-week streak');
    expect(props.footer).toBe('3 of 4 sessions · Updated 18:40');
  });

  it('reads naturally for a session that just started', () => {
    const props = nextUp({ activeSession: { name: 'Push A', startedAt: NOW - 10_000 } });
    expect(props.detail).toBe('Started just now');
  });

  it("shows today's program slot with week and estimate", () => {
    const props = nextUp({
      today: { templateName: 'Pull B', week: 2, estimatedMinutes: 45 },
      suggested: { name: 'Legs' },
      sessionsThisWeek: 2,
    });

    expect(props.eyebrow).toBe('TODAY');
    expect(props.title).toBe('Pull B');
    expect(props.detail).toBe('Week 2 · 45 min');
    expect(props.streakLabel).toBe(null);
  });

  it('falls back to the suggested template, then to an empty ready state', () => {
    const suggested = nextUp({ suggested: { name: 'Legs' } });
    expect(suggested.eyebrow).toBe('SUGGESTED');
    expect(suggested.title).toBe('Legs');
    expect(suggested.detail).toBe('Based on your recent training');

    const empty = nextUp();
    expect(empty.eyebrow).toBe('READY');
    expect(empty.title).toBe('Start a workout');
    expect(empty.detail).toBe('No active program yet');
  });

  it('drops the goal fraction when no weekly goal is set', () => {
    expect(nextUp({ sessionsThisWeek: 2, weeklyGoal: 0 }).footer).toBe(
      '2 sessions this week · Updated 18:40',
    );
    expect(nextUp({ sessionsThisWeek: 1, weeklyGoal: 0 }).footer).toBe(
      '1 session this week · Updated 18:40',
    );
  });

  it('only surfaces a streak from two weeks up', () => {
    expect(nextUp({ streak: 1 }).streakLabel).toBe(null);
    expect(nextUp({ streak: 2 }).streakLabel).toBe('2-week streak');
  });
});

describe('buildThisWeekProps', () => {
  function thisWeek(overrides: Partial<Parameters<typeof buildThisWeekProps>[0]> = {}) {
    return buildThisWeekProps({
      sessionsThisWeek: 0,
      weeklyGoal: 4,
      sessionsToGoal: 4,
      goalMet: false,
      ...palettes,
      ...overrides,
    });
  }

  it('renders the count against the goal with a progress ratio', () => {
    const props = thisWeek({ sessionsThisWeek: 3, sessionsToGoal: 1 });
    expect(props.eyebrow).toBe('THIS WEEK');
    expect(props.count).toBe('3');
    expect(props.goalLabel).toBe('/4');
    expect(props.progress).toBe(0.75);
    expect(props.showProgress).toBe(true);
    expect(props.footer).toBe('1 session to go');
  });

  it('celebrates a met goal and clamps over-achieving progress', () => {
    const props = thisWeek({
      sessionsThisWeek: 5,
      sessionsToGoal: 0,
      goalMet: true,
    });
    expect(props.progress).toBe(1);
    expect(props.footer).toBe('Goal met this week');
  });

  it('hides the bar without a goal and pluralises the count', () => {
    const props = thisWeek({ sessionsThisWeek: 3, weeklyGoal: 0, sessionsToGoal: 0 });
    expect(props.showProgress).toBe(false);
    expect(props.progress).toBe(0);
    expect(props.goalLabel).toBe('');
    expect(props.footer).toBe('3 sessions logged');

    const singular = thisWeek({ sessionsThisWeek: 1, weeklyGoal: 0, sessionsToGoal: 0 });
    expect(singular.footer).toBe('1 session logged');
  });

  it('pluralises the remaining count', () => {
    expect(thisWeek({ sessionsThisWeek: 1, sessionsToGoal: 3 }).footer).toBe('3 sessions to go');
  });
});

describe('widget formatting', () => {
  it('formats elapsed time compactly', () => {
    expect(formatElapsed(NOW - 20 * 1000, NOW)).toBe('just now');
    expect(formatElapsed(NOW - 12 * 60 * 1000, NOW)).toBe('12 min');
    expect(formatElapsed(NOW - 65 * 60 * 1000, NOW)).toBe('1h 05m');
  });

  it('keeps the updated stamp truthful as it ages', () => {
    expect(formatUpdatedAt(NOW, NOW)).toBe('Updated 18:40');
    const yesterday = new Date(2026, 9, 21, 7, 5).getTime();
    expect(formatUpdatedAt(yesterday, NOW)).toBe('Updated Wed 07:05');
    const lastYear = new Date(2025, 11, 2, 7, 5).getTime();
    expect(formatUpdatedAt(lastYear, NOW)).toBe('Updated Dec 2');
  });
});
