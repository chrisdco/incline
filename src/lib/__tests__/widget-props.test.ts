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
    volumeThisWeek: 0,
    volumeLastWeek: 0,
    formatVolume: (kg: number) => `${kg} kg`,
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

    expect(props.eyebrow).toBe('In progress');
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

    expect(props.eyebrow).toBe('Today');
    expect(props.title).toBe('Pull B');
    expect(props.detail).toBe('Week 2 · 45 min');
    expect(props.streakLabel).toBe(null);
  });

  it('falls back to the suggested template, then to an empty ready state', () => {
    const suggested = nextUp({ suggested: { name: 'Legs' } });
    expect(suggested.eyebrow).toBe('Suggested');
    expect(suggested.title).toBe('Legs');
    expect(suggested.detail).toBe('Based on your recent training');

    const empty = nextUp();
    expect(empty.eyebrow).toBe('Ready');
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

  it('compares volume with last week, and stays quiet without it', () => {
    const up = nextUp({ volumeThisWeek: 1200, volumeLastWeek: 1000 });
    expect(up.volume).toBe('1200 kg');
    expect(up.volumeDelta).toBe('▲ 200 kg');
    expect(up.volumeUp).toBe(true);
    const down = nextUp({ volumeThisWeek: 700, volumeLastWeek: 1000 });
    expect(down.volumeDelta).toBe('▼ 300 kg');
    expect(down.volumeUp).toBe(false);
    expect(nextUp({ volumeThisWeek: 700 }).volumeDelta).toBe(null);
  });
});

describe('buildThisWeekProps', () => {
  function thisWeek(overrides: Partial<Parameters<typeof buildThisWeekProps>[0]> = {}) {
    return buildThisWeekProps({
      sessionsThisWeek: 0,
      weeklyGoal: 4,
      sessionsToGoal: 4,
      goalMet: false,
      trainedDays: [false, false, false, false, false, false, false],
      todayIndex: 0,
      ...palettes,
      ...overrides,
    });
  }

  it('renders the count against the goal with Mon–Sun days', () => {
    const props = thisWeek({
      sessionsThisWeek: 3,
      sessionsToGoal: 1,
      trainedDays: [true, false, true, false, false, true, false],
      todayIndex: 3,
    });
    expect(props.eyebrow).toBe('This week');
    expect(props.count).toBe('3');
    expect(props.countLabel).toBe('of 4 workouts');
    expect(props.days.map((d) => d.letter).join('')).toBe('MTWTFSS');
    expect(props.days.filter((d) => d.trained)).toHaveLength(3);
    expect(props.days[3].isToday).toBe(true);
    expect(props.footer).toBe('1 to go');
  });

  it('marks a met goal', () => {
    expect(thisWeek({ sessionsThisWeek: 5, sessionsToGoal: 0, goalMet: true }).footer).toBe('Goal met');
  });

  it('drops the goal without one and pluralises the noun', () => {
    const props = thisWeek({ sessionsThisWeek: 3, weeklyGoal: 0, sessionsToGoal: 0 });
    expect(props.countLabel).toBe('workouts');
    expect(props.footer).toBe('No weekly goal set');
    expect(thisWeek({ sessionsThisWeek: 1, weeklyGoal: 0, sessionsToGoal: 0 }).countLabel).toBe('workout');
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
