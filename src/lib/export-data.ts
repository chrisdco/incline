/**
 * Pure CSV/JSON builders for workout export (#6).
 * DB gathering lives in `src/db/queries/export.ts`.
 */
import type { SetType } from '@/db/types';

export type ExportRange = 'all' | '30d' | '90d' | '365d';

export type ExportSectionId = 'workouts' | 'customExercises' | 'bodyweight' | 'bodyMeasurements';

export interface ExportSelection {
  workouts: boolean;
  customExercises: boolean;
  bodyweight: boolean;
  bodyMeasurements: boolean;
}

export const DEFAULT_EXPORT_SELECTION: ExportSelection = {
  workouts: true,
  customExercises: true,
  bodyweight: true,
  bodyMeasurements: true,
};

export const EXPORT_SECTION_OPTIONS: { id: ExportSectionId; label: string; hint: string }[] = [
  { id: 'workouts', label: 'Workouts & sets', hint: 'Finished sessions, one row per set' },
  { id: 'customExercises', label: 'Custom exercises', hint: 'Your catalog, not the built-in library' },
  { id: 'bodyweight', label: 'Bodyweight', hint: 'Logged scale entries' },
  { id: 'bodyMeasurements', label: 'Circumference', hint: 'Arms, chest, waist, hips, thighs, calves' },
];

export interface ExportSetRow {
  workoutId: number;
  workoutUuid: string | null;
  workoutName: string;
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number;
  totalVolume: number;
  notes: string;
  exerciseId: number;
  exerciseName: string;
  exerciseExternalId: string | null;
  setIndex: number;
  weight: number;
  reps: number;
  completed: boolean;
  restSeconds: number | null;
  setType: SetType;
  rpe: number | null;
}

export interface ExportWorkoutJson {
  id: number;
  uuid: string | null;
  name: string;
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number;
  totalVolume: number;
  notes: string;
  sets: {
    exerciseId: number;
    exerciseName: string;
    exerciseExternalId: string | null;
    setIndex: number;
    weight: number;
    reps: number;
    completed: boolean;
    restSeconds: number | null;
    setType: SetType;
    rpe: number | null;
  }[];
}

export interface ExportPayload {
  exportedAt: string;
  version: 1;
  app: 'incline';
  range: ExportRange;
  selection?: ExportSelection;
  profile: {
    name: string;
    unit: string;
    goal: string | null;
  } | null;
  workouts: ExportWorkoutJson[];
  customExercises: {
    id: number;
    uuid: string | null;
    name: string;
    primaryMuscle: string;
    equipment: string;
    externalId: string | null;
  }[];
  bodyweight: {
    id: number;
    weight: number;
    unit: string;
    recordedAt: number;
  }[];
  bodyMeasurements: {
    id: number;
    metric: string;
    value: number;
    unit: string;
    recordedAt: number;
  }[];
}

export function rangeStartMs(range: ExportRange, now = Date.now()): number | null {
  if (range === 'all') return null;
  const days = range === '30d' ? 30 : range === '90d' ? 90 : 365;
  return now - days * 86_400_000;
}

export function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  const s = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CSV_HEADERS = [
  'workout_id',
  'workout_uuid',
  'workout_name',
  'started_at_iso',
  'ended_at_iso',
  'duration_seconds',
  'total_volume',
  'workout_notes',
  'exercise_id',
  'exercise_name',
  'exercise_external_id',
  'set_index',
  'weight',
  'reps',
  'completed',
  'rest_seconds',
  'set_type',
  'rpe',
] as const;

export function buildSetsCsv(rows: ExportSetRow[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.workoutId),
        csvEscape(r.workoutUuid),
        csvEscape(r.workoutName),
        csvEscape(new Date(r.startedAt).toISOString()),
        csvEscape(r.endedAt != null ? new Date(r.endedAt).toISOString() : ''),
        csvEscape(r.durationSeconds),
        csvEscape(r.totalVolume),
        csvEscape(r.notes),
        csvEscape(r.exerciseId),
        csvEscape(r.exerciseName),
        csvEscape(r.exerciseExternalId),
        csvEscape(r.setIndex),
        csvEscape(r.weight),
        csvEscape(r.reps),
        csvEscape(r.completed),
        csvEscape(r.restSeconds),
        csvEscape(r.setType),
        csvEscape(r.rpe),
      ].join(','),
    );
  }
  return lines.join('\n');
}

export function buildBodyweightCsv(rows: ExportPayload['bodyweight']): string {
  const lines = ['id,weight,unit,recorded_at_iso'];
  for (const r of rows) {
    lines.push([csvEscape(r.id), csvEscape(r.weight), csvEscape(r.unit), csvEscape(new Date(r.recordedAt).toISOString())].join(','));
  }
  return lines.join('\n');
}

export function buildMeasurementsCsv(rows: ExportPayload['bodyMeasurements']): string {
  const lines = ['id,metric,value,unit,recorded_at_iso'];
  for (const r of rows) {
    lines.push([
      csvEscape(r.id),
      csvEscape(r.metric),
      csvEscape(r.value),
      csvEscape(r.unit),
      csvEscape(new Date(r.recordedAt).toISOString()),
    ].join(','));
  }
  return lines.join('\n');
}

export function buildCustomExercisesCsv(rows: ExportPayload['customExercises']): string {
  const lines = ['id,uuid,name,primary_muscle,equipment,external_id'];
  for (const r of rows) {
    lines.push([
      csvEscape(r.id),
      csvEscape(r.uuid),
      csvEscape(r.name),
      csvEscape(r.primaryMuscle),
      csvEscape(r.equipment),
      csvEscape(r.externalId),
    ].join(','));
  }
  return lines.join('\n');
}

export function selectedExportSections(sel: ExportSelection): ExportSectionId[] {
  return EXPORT_SECTION_OPTIONS.map((o) => o.id).filter((id) => sel[id]);
}

export function applyExportSelection(payload: ExportPayload, sel: ExportSelection): ExportPayload {
  return {
    ...payload,
    selection: sel,
    workouts: sel.workouts ? payload.workouts : [],
    customExercises: sel.customExercises ? payload.customExercises : [],
    bodyweight: sel.bodyweight ? payload.bodyweight : [],
    bodyMeasurements: sel.bodyMeasurements ? payload.bodyMeasurements : [],
  };
}

export function isExportPayloadEmpty(payload: ExportPayload): boolean {
  return (
    payload.workouts.length === 0
    && payload.customExercises.length === 0
    && payload.bodyweight.length === 0
    && payload.bodyMeasurements.length === 0
  );
}

export function csvForSingleSection(
  section: ExportSectionId,
  payload: ExportPayload,
  setRows: ExportSetRow[],
): { contents: string; filenamePrefix: string } | null {
  if (section === 'workouts') {
    if (setRows.length === 0) return null;
    return { contents: buildSetsCsv(setRows), filenamePrefix: 'incline-workouts' };
  }
  if (section === 'bodyweight') {
    if (payload.bodyweight.length === 0) return null;
    return { contents: buildBodyweightCsv(payload.bodyweight), filenamePrefix: 'incline-bodyweight' };
  }
  if (section === 'bodyMeasurements') {
    if (payload.bodyMeasurements.length === 0) return null;
    return { contents: buildMeasurementsCsv(payload.bodyMeasurements), filenamePrefix: 'incline-measurements' };
  }
  if (payload.customExercises.length === 0) return null;
  return { contents: buildCustomExercisesCsv(payload.customExercises), filenamePrefix: 'incline-exercises' };
}

export function buildExportJson(payload: ExportPayload): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function stampFilename(prefix: string, ext: 'csv' | 'json', at = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${prefix}-${y}${m}${d}.${ext}`;
}
