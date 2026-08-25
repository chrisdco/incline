import { describe, expect, it } from 'vitest';

import {
  formatGhostDelta,
  isWorkingSet,
  workingSetCount,
  workingSetVolume,
} from '../session-ghost';

describe('session ghost', () => {
  it('counts only completed working sets with load', () => {
    const sets = [
      { completed: true, setType: 'warmup', weight: 40, reps: 8 },
      { completed: true, setType: 'working', weight: 100, reps: 5 },
      { completed: true, setType: null, weight: 100, reps: 5 },
      { completed: false, setType: 'working', weight: 100, reps: 5 },
      { completed: true, setType: 'working', weight: 0, reps: 8 },
    ];
    expect(sets.filter(isWorkingSet)).toHaveLength(2);
    expect(workingSetVolume(sets)).toBe(1000);
    expect(workingSetCount(sets)).toBe(2);
  });

  it('does not treat extra warm-ups as beating last time', () => {
    const last = workingSetVolume([
      { completed: true, setType: 'working', weight: 100, reps: 5 },
    ]);
    const liveWithWarmups = workingSetVolume([
      { completed: true, setType: 'warmup', weight: 40, reps: 10 },
      { completed: true, setType: 'warmup', weight: 40, reps: 10 },
      { completed: true, setType: 'working', weight: 100, reps: 5 },
    ]);
    expect(liveWithWarmups).toBe(last);
    expect(formatGhostDelta(liveWithWarmups, last)).toBe(0);
  });
});
