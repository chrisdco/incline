export function isWorkingSet(set: {
  completed: boolean;
  setType?: string | null;
  weight: number;
  reps: number;
}): boolean {
  if (!set.completed) return false;
  const kind = set.setType ?? 'working';
  if (kind !== 'working') return false;
  return set.weight > 0 && set.reps > 0;
}

export function workingSetVolume(sets: { completed: boolean; setType?: string | null; weight: number; reps: number }[]): number {
  return sets.reduce((sum, s) => (isWorkingSet(s) ? sum + s.weight * s.reps : sum), 0);
}

export function workingSetCount(sets: { completed: boolean; setType?: string | null; weight: number; reps: number }[]): number {
  return sets.filter(isWorkingSet).length;
}

export function ghostWorkingSql(): string {
  return `(s.set_type IS NULL OR s.set_type = 'working') AND s.weight > 0 AND s.reps > 0 AND s.completed = 1 AND s.deleted_at IS NULL`;
}

export type SessionGhost = {
  logId: number;
  startedAt: number;
  durationSeconds: number;
  workingVolume: number;
  workingSetCount: number;
};

export function formatGhostDelta(live: number, last: number): number | null {
  if (last <= 0) return null;
  return Math.round(((live - last) / last) * 100);
}
