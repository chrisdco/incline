export type { SessionSet, SessionWorkout } from './helpers';

export {
  listExercises,
  getExercise,
  getExerciseByExternalId,
  searchExercises,
  createCustomExercise,
  deleteCustomExercise,
  listCustomExercises,
  getCustomExerciseUsage,
  updateExerciseDefaultRest,
  getExerciseDefaultRest,
  ensureExerciseExists,
  getLastSetsForExercise,
  getLastSetsForExercises,
  getExerciseHistory,
  getExercisePRSummary,
  getExerciseRepRecords,
  getExerciseProgression,
  getExerciseSeries,
  type ExerciseFilters,
  type CreateCustomExerciseInput,
  type ExercisePRSummary,
  type RepRecord,
  type ProgressionPoint,
  type ExerciseSeriesPoint,
} from './exercises';

export {
  listTemplates,
  getTemplate,
  listTemplateSummaries,
  getSuggestedTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  addExerciseToTemplate,
  updateTemplateExercise,
  removeTemplateExercise,
  reorderTemplateExercises,
  linkTemplateExerciseWithNext,
  unlinkTemplateExercise,
  duplicateTemplate,
  createTemplateFromWorkoutLog,
  createDeloadTemplate,
  type TemplateSummary,
} from './templates';

export {
  listPrograms,
  getProgram,
  createProgram,
  updateProgram,
  deleteProgram,
  setProgramDay,
  clearProgramDay,
  applyWeek1ToAllWeeks,
  getActiveProgramState,
  setActiveProgram,
  clearActiveProgram,
  getTodayProgramSlot,
  weekdayMon1,
  type ActiveProgramState,
  type TodayProgramSlot,
} from './programs';

export {
  getWorkoutMuscleSplit,
  getActiveWorkout,
  getWorkoutLog,
  getRestDefaultsForSession,
  startWorkout,
  addExerciseToWorkout,
  addWarmUpSet,
  addSet,
  updateSet,
  removeSet,
  restoreSet,
  updateWorkoutNotes,
  updateWorkoutLogStartedAt,
  updateWorkoutDuration,
  finishWorkout,
  discardWorkout,
  listWorkoutLogs,
  listExercisesUsedInHistory,
  listWorkoutFeedLogs,
  getWorkoutFeedForDay,
  getPreviousTemplateVolume,
  getSessionGhost,
  deleteWorkout,
  clearWorkoutHistory,
  type MuscleSplit,
  type SessionGhost,
  type SetPatch,
  type WorkoutLogFilters,
} from './sessions';

export {
  getWorkoutPrCount,
  getWorkoutPrs,
  type WorkoutPr,
} from './coaching/prs';

export {
  getStreak,
  getProgressStats,
  getPeriodStats,
  getWorkoutDays,
  getDailyVolumeByDate,
  getDailyCalendarMetrics,
  getWorkoutsByDateRange,
  getWorkoutsForDay,
  getWorkoutCountInRange,
  getWeeklyConsistency,
  getBestWeeklyStreak,
  getSessionsInWeek,
  type DailyCalendarMetrics,
  type WeeklyConsistency,
} from './progress';

export {
  getTemplateSuggestions,
  getExerciseSuggestion,
  getMuscleExposureDays,
  getExerciseSubstitutes,
} from './coaching/suggestions';

export { getActiveProgramPlanDiff } from './coaching/program-plan';

export {
  getWeeklyRecap,
  getMonthlyRecap,
  weekBounds,
  formatWeekRangeLabel,
  monthBounds,
  formatMonthLabel,
  previousMonthStart,
  monthKey,
  weeklyDigestNotificationBody,
  monthlyRecapNotificationBody,
} from './recap';

export {
  getProfile,
  saveProfile,
  completeOnboarding,
  resetUserData,
  seedSampleData,
} from './profile';

export {
  addBodyweightEntry,
  getBodyweightEntries,
  getLatestBodyweight,
  deleteBodyweightEntry,
} from './bodyweight';

export {
  addBodyMeasurement,
  getBodyMeasurements,
  deleteBodyMeasurement,
} from './measurements';

export {
  shareWorkoutCsv,
  shareWorkoutJson,
  shareSelectedExport,
} from './export';

export {
  listWorkoutPhotos,
  addWorkoutPhotos,
  deleteWorkoutPhoto,
  listProgressPhotos,
  countProgressPhotos,
  getProgressPhotoById,
  MAX_SESSION_PHOTOS,
} from './photos';
