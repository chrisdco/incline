import { describe, expect, it } from 'vitest';

import {
  REST_MAX_NATIVE_ADDS,
  adoptableDeadline,
  buildRestOngoingProps,
  formatNextSet,
  pickRestTarget,
  restOngoingUrl,
} from '@/lib/rest-ongoing/build';

const NOW = new Date(2026, 9, 29, 14, 30, 0).getTime();
const hhmmss = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

describe('formatNextSet', () => {
  it('formats weight × reps in the display unit', () => {
    expect(formatNextSet({ setNumber: 3, weightKg: 80, reps: 8, unit: 'metric' })).toBe(
      'Next: Set 3 · 80 kg × 8',
    );
    expect(formatNextSet({ setNumber: 1, weightKg: 100, reps: 5, unit: 'imperial' })).toBe(
      'Next: Set 1 · 220.5 lb × 5',
    );
  });

  it('handles bodyweight, empty sets, warm-ups and nothing left', () => {
    expect(formatNextSet({ setNumber: 2, weightKg: 0, reps: 12, unit: 'metric' })).toBe(
      'Next: Set 2 · 12 reps',
    );
    expect(formatNextSet({ setNumber: 2, weightKg: 0, reps: 0, unit: 'metric' })).toBe('Next: Set 2');
    expect(
      formatNextSet({ setNumber: 1, weightKg: 40, reps: 10, unit: 'metric', warmUp: true }),
    ).toBe('Next: Warm-up · 40 kg × 10');
    expect(formatNextSet(null)).toBeNull();
  });
});

describe('buildRestOngoingProps', () => {
  const props = buildRestOngoingProps({
    sessionId: 7,
    exerciseName: '  Bench Press ',
    deadline: NOW + 90_000,
    next: { setNumber: 3, weightKg: 80, reps: 8, unit: 'metric' },
    formatTime: hhmmss,
  });

  it('labels and links the rest', () => {
    expect(props.label).toBe('Rest · Bench Press');
    expect(props.countdownTo).toBe(NOW + 90_000);
    expect(props.next).toBe('Next: Set 3 · 80 kg × 8');
    expect(props.finished).toBe(false);
    expect(props.added).toBe(0);
    expect(restOngoingUrl(7)).toBe('incline:///session/7');
  });

  it('precomputes one end label per native +30s press', () => {
    expect(props.endsLabels).toHaveLength(REST_MAX_NATIVE_ADDS + 1);
    expect(props.endsLabels[0]).toBe('Until 14:31:30');
    expect(props.endsLabels[1]).toBe('Until 14:32:00');
    expect(props.endsLabels[REST_MAX_NATIVE_ADDS]).toBe('Until 14:36:30');
  });

  it('falls back to a bare label without an exercise', () => {
    expect(
      buildRestOngoingProps({ sessionId: 1, exerciseName: null, deadline: NOW, next: null, formatTime: hhmmss })
        .label,
    ).toBe('Rest');
  });
});

describe('pickRestTarget', () => {
  const sets = [
    { exerciseId: 1, exerciseName: 'Squat', completed: true, weight: 100, reps: 5 },
    { exerciseId: 2, exerciseName: 'Bench', completed: true, weight: 40, reps: 10, setType: 'warmup' },
    { exerciseId: 2, exerciseName: 'Bench', completed: true, weight: 80, reps: 8 },
    { exerciseId: 2, exerciseName: 'Bench', completed: true, weight: 80, reps: 8 },
    { exerciseId: 2, exerciseName: 'Bench', completed: false, weight: 80, reps: 8 },
  ];

  it('numbers the first unfinished set among working sets', () => {
    expect(pickRestTarget(sets, () => 'metric')).toEqual({
      exerciseName: 'Bench',
      next: { setNumber: 3, weightKg: 80, reps: 8, unit: 'metric', warmUp: false },
    });
  });

  it('returns nothing when every set is done', () => {
    expect(pickRestTarget(sets.slice(0, 4), () => 'metric')).toEqual({ exerciseName: null, next: null });
  });
});

describe('adoptableDeadline', () => {
  it('adopts a future deadline for the same session only', () => {
    expect(adoptableDeadline({ sessionId: 7, countdownTo: NOW + 30_000 }, 7, NOW)).toBe(NOW + 30_000);
    expect(adoptableDeadline({ sessionId: 8, countdownTo: NOW + 30_000 }, 7, NOW)).toBeNull();
  });

  it('ignores skipped, expired and missing notifications', () => {
    expect(
      adoptableDeadline({ sessionId: 7, countdownTo: NOW + 30_000, finished: true }, 7, NOW),
    ).toBeNull();
    expect(adoptableDeadline({ sessionId: 7, countdownTo: NOW + 500 }, 7, NOW)).toBeNull();
    expect(adoptableDeadline(null, 7, NOW)).toBeNull();
  });
});
