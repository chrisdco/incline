import { useStore } from 'zustand';

import { kvStorage } from '@/db/kv';
import {
  addSet,
  addWarmUpSet,
  discardWorkout,
  finishWorkout,
  getExercisePRSummaries,
  getLastSetsForExercises,
  getRestDefaultsForSession,
  getSessionGhost,
  getTemplateSuggestions,
  getWorkoutLog,
  removeExerciseFromWorkout,
  removeSet,
  restoreSet,
  updateSet,
  updateWorkoutNotes,
} from '@/db/queries';
import { useSettings } from '@/store/settings-store';

import { createSessionEngine, type SessionEngineState } from './engine';

export { finishBlock, pausedMsAt, volatileKey, type SessionEngine, type UndoEntry } from './engine';

/** The app's one live-session engine (one open workout at a time). */
export const sessionEngine = createSessionEngine({
  getWorkoutLog,
  getRestDefaultsForSession,
  getLastSetsForExercises,
  getExercisePRSummaries,
  getTemplateSuggestions,
  getSessionGhost,
  updateSet,
  addSet,
  addWarmUpSet,
  removeSet,
  restoreSet,
  removeExerciseFromWorkout,
  updateWorkoutNotes,
  finishWorkout,
  discardWorkout,
  kvGet: kvStorage.getItem,
  kvSet: kvStorage.setItem,
  kvRemove: kvStorage.removeItem,
  settings: () => {
    const s = useSettings.getState();
    return {
      unit: s.unit,
      showSessionGhost: s.showSessionGhost,
      autoStartRest: s.autoStartRest,
      defaultRestSeconds: s.defaultRestSeconds,
    };
  },
});

/** Subscribe to one slice of the live session. */
export function useSessionEngine<T>(selector: (s: SessionEngineState) => T): T {
  return useStore(sessionEngine.store, selector);
}
