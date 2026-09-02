export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'forearms'
  | 'traps'
  | 'full_body';

export type MovementPattern =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat_hinge'
  | 'isolation'
  | 'carry'
  | 'core';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'kettlebell'
  | 'bodyweight'
  | 'band'
  | 'other';

export type Category = 'strength' | 'cardio' | 'mobility' | 'accessory';
export type Goal = 'build_muscle' | 'gain_strength' | 'lose_fat' | 'improve_endurance';
export type Unit = 'metric' | 'imperial';
export type ThemeMode = 'system' | 'light' | 'dark';
export type AccentTheme = 'indigo' | 'teal' | 'copper' | 'coral' | 'emerald' | 'mint';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export interface Exercise {
  id: number;
  name: string;
  aliases: string[];
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  movementPattern: MovementPattern | null;
  equipment: Equipment;
  category: Category;
  isCompound: boolean;
  isCustom: boolean;
  source: 'seed' | 'exercisedb' | 'custom';
  externalId: string | null;
  difficulty: string | null;
  defaultRestSeconds: number;
  instructions: string[];
  tips: string | null;
  imageUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TemplateExercise {
  id: number;
  templateId: number;
  exerciseId: number;
  sortOrder: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number;
  notes: string;
  /** Shared non-null id links adjacent exercises into a superset/circuit. */
  supersetGroup: number | null;
  /** Joined exercise (populated by queries). */
  exercise?: Exercise;
}

export interface WorkoutTemplate {
  id: number;
  name: string;
  description: string;
  category: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  isCustom: boolean;
  createdAt: number;
  updatedAt: number;
  /** Joined exercises ordered by sort_order (populated by queries). */
  exercises?: TemplateExercise[];
}

export interface ProgramWorkout {
  id: number;
  programId: number;
  templateId: number;
  week: number;
  day: number;
  sortOrder: number;
  templateName?: string;
  estimatedMinutes?: number;
  template?: WorkoutTemplate;
}

export interface Program {
  id: number;
  name: string;
  description: string;
  weeks: number;
  isCustom: boolean;
  createdAt: number;
  updatedAt: number;
  workouts?: ProgramWorkout[];
}

export type SetType = 'working' | 'warmup';

export interface SetEntry {
  id: number;
  workoutLogId: number;
  exerciseId: number;
  setIndex: number;
  weight: number;
  reps: number;
  completed: boolean;
  restSeconds: number | null;
  /** Copied from template; NULL = solo exercise. */
  supersetGroup: number | null;
  /** Warm-up sets are excluded from coaching overload calculations. */
  setType?: SetType;
  /** Optional 1–10. Null means skipped; never required to complete a set. */
  rpe?: number | null;
  createdAt: number;
}

export interface WorkoutLog {
  id: number;
  templateId: number | null;
  name: string;
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number;
  totalVolume: number;
  unit: Unit;
  notes: string;
  createdAt: number;
  updatedAt: number;
  /** Derived: true when endedAt is set. */
  isComplete: boolean;
  /** Joined sets (populated when requested). */
  sets?: SetEntry[];
}

export interface WorkoutPhoto {
  id: number;
  workoutLogId: number;
  uri: string;
  sortOrder: number;
  createdAt: number;
}

/** Session photo joined to its finished workout — Progress week-vs-week compare. */
export interface ProgressPhoto {
  id: number;
  workoutLogId: number;
  /** Local file URI until cloud Storage (#109). */
  uri: string;
  sortOrder: number;
  createdAt: number;
  workoutName: string;
  startedAt: number;
  endedAt: number | null;
  templateId: number | null;
}

export interface UserProfile {
  id: number;
  name: string;
  goal: Goal;
  bodyweight: number | null;
  unit: Unit;
  experienceLevel: ExperienceLevel;
  onboardingCompleted: boolean;
  avatarUrl: string | null;
  updatedAt: number;
}

export interface Settings {
  unit: Unit;
  themeMode: ThemeMode;
  /** Brand accent (primary color). Independent of light/dark mode. */
  accentTheme: AccentTheme;
  hapticsEnabled: boolean;
  /** Play sound + haptic when the rest timer finishes. */
  restSoundEnabled: boolean;
  /** Auto-start the rest timer when a set is marked complete. */
  autoStartRest: boolean;
  /** Default rest between sets when adding an exercise to a session. */
  defaultRestSeconds: number;
  /** Show the warm-up set button in the session screen. */
  showWarmUpSets: boolean;
  /** Show optional RPE chips after a completed working set. */
  showRpe: boolean;
  /** Opt-in AI wording for coaching. Numbers still come from local rules. Default off. */
  aiExplanationsEnabled: boolean;
  /** What the calendar month grid encodes in day cell color. */
  calendarHeatMetric: CalendarHeatMetric;
  /** First day of the week for calendar grids. */
  weekStartsOn: WeekStartsOn;
  /** Keep the screen on while an active session is open. */
  keepScreenAwake: boolean;
  /** Opt-in local weekly workout reminders. */
  workoutRemindersEnabled: boolean;
  /** JS weekdays Sunday=0 … Saturday=6. */
  workoutReminderDays: number[];
  workoutReminderHour: number;
  workoutReminderMinute: number;
  /** Opt-in Sunday evening weekly digest notification. */
  weeklyDigestEnabled: boolean;
  weeklyDigestHour: number;
  weeklyDigestMinute: number;
  /** Which body metrics appear on the Measures screen (bodyweight always available). */
  enabledBodyMetrics: BodyMetric[];
  /** Target finished sessions per week (consistency goal). 0 = off. */
  weeklyWorkoutGoal: number;
  /** Dismissed in-app announcement ids (#90). */
  dismissedAnnouncementIds: string[];
  /** Show last-session comparison on workout preview and live session. */
  showSessionGhost: boolean;
}

/** Trackable body metrics on the Measures screen. */
export type BodyMetric =
  | 'bodyweight'
  | 'arms'
  | 'chest'
  | 'waist'
  | 'hips'
  | 'thighs'
  | 'calves';

export const BODY_METRICS: BodyMetric[] = [
  'bodyweight',
  'arms',
  'chest',
  'waist',
  'hips',
  'thighs',
  'calves',
];

export const DEFAULT_ENABLED_BODY_METRICS: BodyMetric[] = [
  'bodyweight',
  'waist',
  'arms',
  'chest',
];

export function isBodyMetric(v: unknown): v is BodyMetric {
  return (
    v === 'bodyweight' ||
    v === 'arms' ||
    v === 'chest' ||
    v === 'waist' ||
    v === 'hips' ||
    v === 'thighs' ||
    v === 'calves'
  );
}

export interface BodyMeasurementEntry {
  id: number;
  metric: Exclude<BodyMetric, 'bodyweight'>;
  value: number;
  unit: string;
  recordedAt: number;
}

/** Month-view day coloring: presence (trained or not) or a load metric. */
export type CalendarHeatMetric = 'presence' | 'volume' | 'intensity' | 'reps';

/** Calendar / week-boundary preference. */
export type WeekStartsOn = 'sunday' | 'monday';

export const CALENDAR_HEAT_METRICS: CalendarHeatMetric[] = ['presence', 'volume', 'intensity', 'reps'];

export function isCalendarHeatMetric(v: unknown): v is CalendarHeatMetric {
  return v === 'presence' || v === 'volume' || v === 'intensity' || v === 'reps';
}

export function isWeekStartsOn(v: unknown): v is WeekStartsOn {
  return v === 'sunday' || v === 'monday';
}

/* ---- Query result shapes ---- */

export interface ExerciseHistoryRow {
  workoutLogId: number;
  workoutName: string;
  startedAt: number;
  setIndex: number;
  weight: number;
  reps: number;
  completed: boolean;
  rpe: number | null;
}

/** How a set beat a previous best. Session toasts and recaps use the celebration kinds. */
export type PrKind = 'heaviest_weight' | 'estimated_1rm' | 'rep_record' | 'volume_record';

export interface PR {
  exerciseId: number;
  exerciseName: string;
  maxWeight: number;
  maxReps: number;
  estimated1RM: number;
  bestSetVolume: number;
  achievedAt: number;
  /** Present when this row is a detected record (session/recap), not a leaderboard snapshot. */
  kinds?: PrKind[];
}

export interface WeeklyVolume {
  weekStart: string;
  volume: number;
  sessions: number;
}

export interface MuscleDistribution {
  muscle: MuscleGroup;
  sets: number;
  volume: number;
}

/** Insights window: week / 30 days / 3 months / year / all-time. */
export type ProgressRange = '1w' | '30d' | '3m' | '1y' | 'all';

export interface MonthlyVolume {
  month: string;
  volume: number;
  sessions: number;
}

export interface Trend {
  volumeDelta: number;
  sessionsDelta: number;
}

export interface ProgressStats {
  totalSessions: number;
  totalVolume: number;
  totalSets: number;
  streak: number;
  weeklyVolume: WeeklyVolume[];
  muscleDistribution: MuscleDistribution[];
  prs: PR[];
  /** Celebration PRs (heaviest or e1RM) across sessions — one per exercise per session. */
  prEventCount: number;
  lastSessionAt: number | null;
}

export interface PeriodStats {
  range: ProgressRange;
  sessions: number;
  totalVolume: number;
  totalSets: number;
  streak: number;
  weeklyVolume: WeeklyVolume[];
  monthlyVolume: MonthlyVolume[];
  muscleDistribution: MuscleDistribution[];
  /** Equal-length window immediately before the selected range (empty for `all`). */
  previousMuscleDistribution: MuscleDistribution[];
  prs: PR[];
  trend: Trend | null;
}

/** Monday–Sunday training recap for reports + digests. */
export interface WeeklyRecap {
  weekStart: string;
  weekStartMs: number;
  weekEndMs: number;
  sessions: number;
  totalVolume: number;
  totalSets: number;
  streak: number;
  volumeDeltaPct: number | null;
  sessionsDeltaPct: number | null;
  prs: PR[];
  muscles: MuscleDistribution[];
  insightLine: string;
}

export interface TopExerciseStat {
  exerciseId: number;
  exerciseName: string;
  sets: number;
  volume: number;
}

/** Calendar-month training recap (previous-month v1 for Home promo). */
export interface MonthlyRecap {
  monthKey: string;
  monthStartMs: number;
  monthEndMs: number;
  sessions: number;
  totalVolume: number;
  totalSets: number;
  durationSeconds: number;
  streak: number;
  trainedDays: number;
  volumeDeltaPct: number | null;
  sessionsDeltaPct: number | null;
  previousSessions: number;
  previousVolume: number;
  previousSets: number;
  previousDurationSeconds: number;
  prs: PR[];
  muscles: MuscleDistribution[];
  previousMuscles: MuscleDistribution[];
  topExercises: TopExerciseStat[];
  /** Local midnight timestamps for days with ≥1 finished session. */
  trainedDayMs: number[];
  insightLine: string;
  /** Last 12 calendar months ending at this recap month (inclusive). */
  yearSeries: MonthSeriesPoint[];
}

export interface MonthSeriesPoint {
  monthKey: string;
  monthStartMs: number;
  label: string;
  sessions: number;
  durationSeconds: number;
  volume: number;
  sets: number;
}

export interface SearchHit {
  exercise: Exercise;
  /** Higher is more relevant. */
  score: number;
  /** Why it matched, for debugging/UX. */
  matchedOn: 'name' | 'alias' | 'muscle' | 'equipment' | 'pattern' | 'category';
}

export interface Paginated<T> {
  items: T[];
  nextOffset: number | null;
}

/** Workout log with all sets and exercise info joined. */
export interface WorkoutLogWithDetails extends WorkoutLog {
  sets: SetEntry[];
  template?: WorkoutTemplate;
}

export interface FeedExercise {
  exerciseId: number;
  exerciseName: string;
  setCount: number;
  imageUrl: string | null;
}

export interface FeedWorkoutLog extends WorkoutLog {
  exercises: FeedExercise[];
  prCount: number;
}
