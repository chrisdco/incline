import type * as HC from 'react-native-health-connect';

import type { HealthKind, HealthPort, HealthWorkout, NutritionDay, PointKind, SleepNight, TimeRange } from './types';

/**
 * Health Connect adapter (react-native-health-connect 4.x). The library is
 * required lazily: on a build without its native module (an older APK
 * running a newer OTA) importing it throws, so every call goes through
 * `lib()` and degrades to "unavailable".
 */

type Lib = typeof HC;
let cached: Lib | null | undefined;
let initialized = false;

function lib(): Lib | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: the native module may be absent
    cached = require('react-native-health-connect') as Lib;
  } catch {
    cached = null;
  }
  return cached;
}

async function ready(): Promise<Lib | null> {
  const hc = lib();
  if (!hc) return null;
  try {
    if (!initialized) initialized = await hc.initialize();
    return initialized ? hc : null;
  } catch {
    return null;
  }
}

/** Our kinds → Health Connect record types. */
export const RECORD_TYPE = {
  sleep: 'SleepSession',
  restingHeartRate: 'RestingHeartRate',
  hrv: 'HeartRateVariabilityRmssd',
  weight: 'Weight',
  steps: 'Steps',
  nutrition: 'Nutrition',
} as const satisfies Record<HealthKind, HC.RecordType>;

const KIND_OF: Record<string, HealthKind> = Object.fromEntries(Object.entries(RECORD_TYPE).map(([k, v]) => [v, k as HealthKind]));

/** Health Connect stage codes that are not sleep (SleepStageType: AWAKE 1, OUT_OF_BED 3). */
const NOT_ASLEEP = new Set([1, 3]);

const filter = (r: TimeRange) => ({
  operator: 'between' as const,
  startTime: new Date(r.start).toISOString(),
  endTime: new Date(r.end).toISOString(),
});

export function kindsFrom(perms: readonly { accessType: string; recordType?: string }[]): HealthKind[] {
  const out = new Set<HealthKind>();
  for (const p of perms) {
    const k = p.accessType === 'read' && p.recordType ? KIND_OF[p.recordType] : undefined;
    if (k) out.add(k);
  }
  return [...out];
}

/** Health Connect ExerciseType.STRENGTH_TRAINING. */
const STRENGTH_TRAINING = 70;

/** Local YYYY-MM-DD for a timestamp. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type NutritionRow = {
  startTime: string;
  energy?: { inKilocalories: number };
  protein?: { inGrams: number };
  totalCarbohydrate?: { inGrams: number };
  totalFat?: { inGrams: number };
};

/** Sums Nutrition records into local days (a meal counts on the day it started). */
export function nutritionDays(rows: readonly NutritionRow[]): NutritionDay[] {
  const days = new Map<string, NutritionDay>();
  for (const r of rows) {
    const day = localDay(Date.parse(r.startTime));
    const d = days.get(day) ?? { day, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
    d.kcal += r.energy?.inKilocalories ?? 0;
    d.proteinG += r.protein?.inGrams ?? 0;
    d.carbsG += r.totalCarbohydrate?.inGrams ?? 0;
    d.fatG += r.totalFat?.inGrams ?? 0;
    days.set(day, d);
  }
  const r1 = (n: number) => Math.round(n);
  return [...days.values()]
    .map((d) => ({ day: d.day, kcal: r1(d.kcal), proteinG: r1(d.proteinG), carbsG: r1(d.carbsG), fatG: r1(d.fatG) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

const WRITE_EXERCISE = { accessType: 'write' as const, recordType: 'ExerciseSession' as const };

function hasWrite(perms: readonly { accessType: string; recordType?: string }[]): boolean {
  return perms.some((p) => p.accessType === 'write' && p.recordType === 'ExerciseSession');
}

/** Pages through readRecords; capped so a huge store can't stall a screen. */
async function readAll<T extends HC.RecordType>(hc: Lib, type: T, range: TimeRange, maxPages = 5): Promise<HC.RecordResult<T>[]> {
  const out: HC.RecordResult<T>[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const res = await hc.readRecords(type, { timeRangeFilter: filter(range), pageToken });
    out.push(...res.records);
    pageToken = res.pageToken || undefined;
    if (!pageToken) break;
  }
  return out;
}

/** Time asleep in a session: its span minus awake / out-of-bed stages. */
export function sleepMinutes(rec: { startTime: string; endTime: string; stages?: readonly { startTime: string; endTime: string; stage: number }[] }): number {
  const span = (a: string, b: string) => Math.max(0, Date.parse(b) - Date.parse(a));
  const total = span(rec.startTime, rec.endTime);
  const awake = (rec.stages ?? []).filter((s) => NOT_ASLEEP.has(s.stage)).reduce((sum, s) => sum + span(s.startTime, s.endTime), 0);
  return Math.round(Math.max(0, total - awake) / 60_000);
}

export function createHealthConnectPort(): HealthPort {
  return {
    async availability() {
      const hc = lib();
      if (!hc) return 'unavailable';
      try {
        const status = await hc.getSdkStatus();
        if (status === hc.SdkAvailabilityStatus.SDK_AVAILABLE) return 'available';
        if (status === hc.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'needs_update';
        return 'unavailable';
      } catch {
        return 'unavailable';
      }
    },
    async granted() {
      const hc = await ready();
      if (!hc) return [];
      try {
        return kindsFrom(await hc.getGrantedPermissions());
      } catch {
        return [];
      }
    },
    async requestRead(kinds) {
      const hc = await ready();
      if (!hc) return [];
      try {
        return kindsFrom(await hc.requestPermission(kinds.map((k) => ({ accessType: 'read' as const, recordType: RECORD_TYPE[k] }))));
      } catch {
        return [];
      }
    },
    async readSleep(range) {
      const hc = await ready();
      if (!hc) return [];
      return (await readAll(hc, 'SleepSession', range))
        .map((r): SleepNight => ({ start: Date.parse(r.startTime), end: Date.parse(r.endTime), minutes: sleepMinutes(r) }))
        .sort((a, b) => a.start - b.start);
    },
    async readPoints(kind: PointKind, range) {
      const hc = await ready();
      if (!hc) return [];
      const rows =
        kind === 'weight'
          ? (await readAll(hc, 'Weight', range)).map((r) => ({ at: Date.parse(r.time), value: r.weight.inKilograms }))
          : kind === 'hrv'
            ? (await readAll(hc, 'HeartRateVariabilityRmssd', range)).map((r) => ({ at: Date.parse(r.time), value: r.heartRateVariabilityMillis }))
            : (await readAll(hc, 'RestingHeartRate', range)).map((r) => ({ at: Date.parse(r.time), value: r.beatsPerMinute }));
      return rows.sort((a, b) => a.at - b.at);
    },
    async readSteps(range) {
      const hc = await ready();
      if (!hc) return 0;
      const res = await hc.aggregateRecord({ recordType: 'Steps', timeRangeFilter: filter(range) });
      return res.COUNT_TOTAL ?? 0;
    },
    async readNutrition(range) {
      const hc = await ready();
      if (!hc) return [];
      return nutritionDays((await readAll(hc, 'Nutrition', range, 10)) as unknown as NutritionRow[]);
    },
    async canWriteWorkouts() {
      const hc = await ready();
      if (!hc) return false;
      try {
        return hasWrite(await hc.getGrantedPermissions());
      } catch {
        return false;
      }
    },
    async requestWriteWorkouts() {
      const hc = await ready();
      if (!hc) return false;
      try {
        return hasWrite(await hc.requestPermission([WRITE_EXERCISE]));
      } catch {
        return false;
      }
    },
    async writeWorkouts(workouts: readonly HealthWorkout[]) {
      const hc = await ready();
      if (!hc || workouts.length === 0) return hc != null;
      try {
        await hc.insertRecords(
          workouts.map((w) => ({
            recordType: 'ExerciseSession' as const,
            exerciseType: STRENGTH_TRAINING,
            title: w.title,
            ...(w.notes ? { notes: w.notes } : {}),
            startTime: new Date(w.start).toISOString(),
            endTime: new Date(Math.max(w.end, w.start + 60_000)).toISOString(),
            metadata: { clientRecordId: w.key, clientRecordVersion: w.version },
          })),
        );
        return true;
      } catch {
        return false;
      }
    },
    async deleteWorkouts(keys) {
      const hc = await ready();
      if (!hc) return false;
      if (keys.length === 0) return true;
      try {
        await hc.deleteRecordsByUuids('ExerciseSession', [], [...keys]);
        return true;
      } catch {
        return false;
      }
    },
    openSettings() {
      try {
        lib()?.openHealthConnectSettings();
      } catch {
        // Health Connect missing: the health screen already says so.
      }
    },
  };
}
