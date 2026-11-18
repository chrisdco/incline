/**
 * Whether auto-rest should start after completing a set.
 * Solo: always. Superset: only when every exercise in the group has completed
 * the same setIndex (one round finished).
 */
export function shouldStartRestAfterComplete(
  sets: {
    id: number;
    exerciseId: number;
    setIndex: number;
    completed: boolean;
    supersetGroup: number | null;
    setType?: string | null;
  }[],
  completedSetId: number,
): { start: boolean; kind: 'set' | 'superset' } {
  const target = sets.find((s) => s.id === completedSetId);
  if (!target || !target.completed) return { start: false, kind: 'set' };

  // A drop set follows with no rest (WORKOUT-SETS.md "Drop sets"): hold the
  // timer while the next set of this exercise is an unfinished drop.
  const next = sets
    .filter((s) => s.exerciseId === target.exerciseId && s.setIndex > target.setIndex)
    .sort((a, b) => a.setIndex - b.setIndex)[0];
  if (next && next.setType === 'drop' && !next.completed) return { start: false, kind: 'set' };

  const groupId = target.supersetGroup;
  if (groupId == null) return { start: true, kind: 'set' };

  const groupExerciseIds = [
    ...new Set(sets.filter((s) => s.supersetGroup === groupId).map((s) => s.exerciseId)),
  ];
  if (groupExerciseIds.length <= 1) return { start: true, kind: 'set' };

  const roundDone = groupExerciseIds.every((exerciseId) =>
    sets.some(
      (s) =>
        s.exerciseId === exerciseId &&
        s.supersetGroup === groupId &&
        s.setIndex === target.setIndex &&
        s.completed,
    ),
  );
  return { start: roundDone, kind: 'superset' };
}
