import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { openDatabase } from '../client';
import { isSetType } from '../types';
import {
  buildExportJson,
  csvForSingleSection,
  applyExportSelection,
  isExportPayloadEmpty,
  selectedExportSections,
  rangeStartMs,
  stampFilename,
  DEFAULT_EXPORT_SELECTION,
  type ExportPayload,
  type ExportRange,
  type ExportSelection,
  type ExportSetRow,
  type ExportWorkoutJson,
} from '@/lib/export-data';

interface SetJoinRow {
  workout_id: number;
  workout_uuid: string | null;
  workout_name: string;
  started_at: number;
  ended_at: number | null;
  duration_seconds: number;
  total_volume: number;
  notes: string;
  exercise_id: number;
  exercise_name: string;
  exercise_external_id: string | null;
  set_index: number;
  weight: number;
  reps: number;
  completed: number;
  rest_seconds: number | null;
  set_type: string | null;
  rpe: number | null;
}

async function loadExportSetRows(range: ExportRange): Promise<ExportSetRow[]> {
  const db = await openDatabase();
  const since = rangeStartMs(range);
  const rows = since == null
    ? await db.getAllAsync<SetJoinRow>(
        `SELECT
           w.id as workout_id, w.uuid as workout_uuid, w.name as workout_name,
           w.started_at, w.ended_at, w.duration_seconds, w.total_volume, w.notes,
           s.exercise_id, e.name as exercise_name, e.external_id as exercise_external_id,
           s.set_index, s.weight, s.reps, s.completed, s.rest_seconds, s.set_type, s.rpe
         FROM set_entries s
         JOIN workout_logs w ON w.id = s.workout_log_id
         JOIN exercises e ON e.id = s.exercise_id
         WHERE w.ended_at IS NOT NULL AND w.deleted_at IS NULL AND s.deleted_at IS NULL
         ORDER BY w.started_at ASC, s.exercise_id ASC, s.set_index ASC`,
      )
    : await db.getAllAsync<SetJoinRow>(
        `SELECT
           w.id as workout_id, w.uuid as workout_uuid, w.name as workout_name,
           w.started_at, w.ended_at, w.duration_seconds, w.total_volume, w.notes,
           s.exercise_id, e.name as exercise_name, e.external_id as exercise_external_id,
           s.set_index, s.weight, s.reps, s.completed, s.rest_seconds, s.set_type, s.rpe
         FROM set_entries s
         JOIN workout_logs w ON w.id = s.workout_log_id
         JOIN exercises e ON e.id = s.exercise_id
         WHERE w.ended_at IS NOT NULL AND w.deleted_at IS NULL AND s.deleted_at IS NULL
           AND w.started_at >= ?
         ORDER BY w.started_at ASC, s.exercise_id ASC, s.set_index ASC`,
        since,
      );

  return rows.map((r) => ({
    workoutId: r.workout_id,
    workoutUuid: r.workout_uuid,
    workoutName: r.workout_name,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSeconds: r.duration_seconds,
    totalVolume: r.total_volume,
    notes: r.notes ?? '',
    exerciseId: r.exercise_id,
    exerciseName: r.exercise_name,
    exerciseExternalId: r.exercise_external_id,
    setIndex: r.set_index,
    weight: r.weight,
    reps: r.reps,
    completed: r.completed === 1,
    restSeconds: r.rest_seconds,
    setType: isSetType(r.set_type) ? r.set_type : 'working',
    rpe: typeof r.rpe === 'number' && r.rpe >= 1 && r.rpe <= 10 ? Math.round(r.rpe) : null,
  }));
}

function groupWorkouts(rows: ExportSetRow[]): ExportWorkoutJson[] {
  const map = new Map<number, ExportWorkoutJson>();
  for (const r of rows) {
    let w = map.get(r.workoutId);
    if (!w) {
      w = {
        id: r.workoutId,
        uuid: r.workoutUuid,
        name: r.workoutName,
        startedAt: r.startedAt,
        endedAt: r.endedAt,
        durationSeconds: r.durationSeconds,
        totalVolume: r.totalVolume,
        notes: r.notes,
        sets: [],
      };
      map.set(r.workoutId, w);
    }
    w.sets.push({
      exerciseId: r.exerciseId,
      exerciseName: r.exerciseName,
      exerciseExternalId: r.exerciseExternalId,
      setIndex: r.setIndex,
      weight: r.weight,
      reps: r.reps,
      completed: r.completed,
      restSeconds: r.restSeconds,
      setType: r.setType,
      rpe: r.rpe,
    });
  }
  return [...map.values()];
}

async function loadTimedRows<T extends { recorded_at: number }>(
  sqlAll: string,
  sqlSince: string,
  range: ExportRange,
): Promise<T[]> {
  const db = await openDatabase();
  const since = rangeStartMs(range);
  if (since == null) return db.getAllAsync<T>(sqlAll);
  return db.getAllAsync<T>(sqlSince, since);
}

async function buildJsonPayload(range: ExportRange, rows: ExportSetRow[]): Promise<ExportPayload> {
  const db = await openDatabase();
  const profile = await db.getFirstAsync<{ name: string; unit: string; goal: string | null }>(
    'SELECT name, unit, goal FROM user_profile WHERE id = 1',
  );
  const customExercises = await db.getAllAsync<{
    id: number;
    uuid: string | null;
    name: string;
    primary_muscle: string;
    equipment: string;
    external_id: string | null;
  }>(
    `SELECT id, uuid, name, primary_muscle, equipment, external_id
     FROM exercises WHERE is_custom = 1 AND deleted_at IS NULL ORDER BY name`,
  );
  const bodyweight = await loadTimedRows<{
    id: number;
    weight: number;
    unit: string;
    recorded_at: number;
  }>(
    'SELECT id, weight, unit, recorded_at FROM bodyweight_entries WHERE deleted_at IS NULL ORDER BY recorded_at ASC',
    'SELECT id, weight, unit, recorded_at FROM bodyweight_entries WHERE deleted_at IS NULL AND recorded_at >= ? ORDER BY recorded_at ASC',
    range,
  );
  const bodyMeasurements = await loadTimedRows<{
    id: number;
    metric: string;
    value: number;
    unit: string;
    recorded_at: number;
  }>(
    'SELECT id, metric, value, unit, recorded_at FROM body_measurements WHERE deleted_at IS NULL ORDER BY recorded_at ASC',
    'SELECT id, metric, value, unit, recorded_at FROM body_measurements WHERE deleted_at IS NULL AND recorded_at >= ? ORDER BY recorded_at ASC',
    range,
  );

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    app: 'incline',
    range,
    profile: profile
      ? { name: profile.name, unit: profile.unit, goal: profile.goal }
      : null,
    workouts: groupWorkouts(rows),
    customExercises: customExercises.map((e) => ({
      id: e.id,
      uuid: e.uuid,
      name: e.name,
      primaryMuscle: e.primary_muscle,
      equipment: e.equipment,
      externalId: e.external_id,
    })),
    bodyweight: bodyweight.map((b) => ({
      id: b.id,
      weight: b.weight,
      unit: b.unit,
      recordedAt: b.recorded_at,
    })),
    bodyMeasurements: bodyMeasurements.map((m) => ({
      id: m.id,
      metric: m.metric,
      value: m.value,
      unit: m.unit,
      recordedAt: m.recorded_at,
    })),
  };
}

async function writeAndShare(contents: string, filename: string, mimeType: string): Promise<void> {
  const dir = cacheDirectory;
  if (!dir) throw new Error('No cache directory available');
  const uri = `${dir}${filename}`;
  await writeAsStringAsync(uri, contents, { encoding: 'utf8' });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, {
    mimeType,
    dialogTitle: 'Export workout data',
    UTI: mimeType === 'text/csv' ? 'public.comma-separated-values-text' : 'public.json',
  });
}

export interface ExportShareResult {
  shared: boolean;
  format: 'csv' | 'json';
  itemCount: number;
  usedJsonFallback?: boolean;
}

async function loadSelectedPayload(
  range: ExportRange,
  selection: ExportSelection,
): Promise<{ payload: ExportPayload; setRows: ExportSetRow[] }> {
  const setRows = selection.workouts ? await loadExportSetRows(range) : [];
  const raw = await buildJsonPayload(range, setRows);
  return { payload: applyExportSelection(raw, selection), setRows };
}

/** CSV for a single selected table, or JSON when several types are on. */
export async function shareSelectedExport(
  format: 'csv' | 'json',
  range: ExportRange = 'all',
  selection: ExportSelection = DEFAULT_EXPORT_SELECTION,
): Promise<ExportShareResult> {
  const sections = selectedExportSections(selection);
  if (sections.length === 0) return { shared: false, format, itemCount: 0 };

  const { payload, setRows } = await loadSelectedPayload(range, selection);
  if (isExportPayloadEmpty(payload)) return { shared: false, format, itemCount: 0 };

  const itemCount =
    payload.workouts.length
    + payload.customExercises.length
    + payload.bodyweight.length
    + payload.bodyMeasurements.length;

  if (format === 'csv' && sections.length === 1) {
    const csv = csvForSingleSection(sections[0], payload, setRows);
    if (!csv) return { shared: false, format, itemCount: 0 };
    await writeAndShare(csv.contents, stampFilename(csv.filenamePrefix, 'csv'), 'text/csv');
    return { shared: true, format: 'csv', itemCount };
  }

  const json = buildExportJson(payload);
  await writeAndShare(json, stampFilename('incline-backup', 'json'), 'application/json');
  return {
    shared: true,
    format: 'json',
    itemCount,
    usedJsonFallback: format === 'csv',
  };
}

/** Build set-level CSV and open the system share sheet. */
export async function shareWorkoutCsv(range: ExportRange = 'all'): Promise<{ rowCount: number; shared: boolean }> {
  const result = await shareSelectedExport('csv', range, {
    ...DEFAULT_EXPORT_SELECTION,
    customExercises: false,
    bodyweight: false,
    bodyMeasurements: false,
  });
  return { rowCount: result.itemCount, shared: result.shared };
}

/** Build full JSON backup and open the system share sheet. */
export async function shareWorkoutJson(
  range: ExportRange = 'all',
  selection: ExportSelection = DEFAULT_EXPORT_SELECTION,
): Promise<{ workoutCount: number; shared: boolean }> {
  const result = await shareSelectedExport('json', range, selection);
  return { workoutCount: result.itemCount, shared: result.shared };
}
