import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import {
  formatGhostDelta,
  ghostWorkingSql,
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

  it('warm-ups cannot beat last time even when heavier than the working sets', () => {
    const last = workingSetVolume([{ completed: true, setType: 'working', weight: 100, reps: 5 }]);
    const live = workingSetVolume([
      { completed: true, setType: 'warmup', weight: 120, reps: 5 },
      { completed: true, setType: 'warmup', weight: 120, reps: 5 },
      { completed: true, setType: 'working', weight: 90, reps: 5 },
    ]);
    expect(live).toBe(450);
    expect(formatGhostDelta(live, last)).toBeLessThan(0);
  });

  it('the SQL filter behind "Last time" leaves warm-ups out too', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE workout_sets (set_type TEXT, weight REAL, reps INTEGER, completed INTEGER, deleted_at INTEGER)`);
    const insert = db.prepare('INSERT INTO workout_sets VALUES (?, ?, ?, ?, ?)');
    insert.run('warmup', 60, 10, 1, null);
    insert.run('warmup', 120, 5, 1, null);
    insert.run('working', 100, 5, 1, null);
    insert.run(null, 100, 5, 1, null);
    insert.run('working', 100, 5, 1, 1_700_000_000); // deleted
    insert.run('working', 100, 5, 0, null); // not completed
    const row = db.prepare(`SELECT COALESCE(SUM(s.weight * s.reps), 0) AS v, COUNT(*) AS n FROM workout_sets s WHERE ${ghostWorkingSql('s')}`).get() as {
      v: number;
      n: number;
    };
    db.close();
    expect(row).toEqual({ v: 1000, n: 2 });
  });
});
