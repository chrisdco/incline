/**
 * Our health seam (decisions/HEALTH.md). Screens, rules and Ask only see
 * these shapes; each platform gets an adapter (Health Connect now,
 * HealthKit later). Swapping a library touches one file.
 */

export const HEALTH_KINDS = ['sleep', 'restingHeartRate', 'hrv', 'weight', 'steps'] as const;
export type HealthKind = (typeof HEALTH_KINDS)[number];

export const HEALTH_KIND_LABEL: Record<HealthKind, string> = {
  sleep: 'Sleep',
  restingHeartRate: 'Resting heart rate',
  hrv: 'Heart rate variability',
  weight: 'Weight',
  steps: 'Steps',
};

/** `needs_update`: the Health Connect app is missing or too old (Android 13 and below). */
export type HealthAvailability = 'available' | 'needs_update' | 'unavailable';

export interface TimeRange {
  start: number;
  end: number;
}

/** One sleep session; `minutes` is time asleep (awake / out-of-bed stages removed). */
export interface SleepNight {
  start: number;
  end: number;
  minutes: number;
}

/** An instant reading: resting HR (bpm), HRV RMSSD (ms) or weight (kg). */
export interface PointSample {
  at: number;
  value: number;
}

export type PointKind = 'restingHeartRate' | 'hrv' | 'weight';

export interface HealthPort {
  availability(): Promise<HealthAvailability>;
  /** Kinds the user has granted read access to. Never throws; [] when unknown. */
  granted(): Promise<HealthKind[]>;
  /** Shows the platform permission sheet; resolves to what is granted afterwards. */
  requestRead(kinds: readonly HealthKind[]): Promise<HealthKind[]>;
  readSleep(range: TimeRange): Promise<SleepNight[]>;
  readPoints(kind: PointKind, range: TimeRange): Promise<PointSample[]>;
  readSteps(range: TimeRange): Promise<number>;
  /** Opens the platform's own health permissions screen. */
  openSettings(): void;
}

/** The port when the platform has no health store (iOS until HealthKit, web, tests). */
export const UNAVAILABLE_HEALTH: HealthPort = {
  availability: async () => 'unavailable',
  granted: async () => [],
  requestRead: async () => [],
  readSleep: async () => [],
  readPoints: async () => [],
  readSteps: async () => 0,
  openSettings: () => {},
};
