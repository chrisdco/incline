import type { ExerciseRef, SyncOp, SyncTable, TemplateRef } from './types';
import { isSetType, type SetType } from '@/db/types';

export function msToIso(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  return new Date(ms).toISOString();
}

export function isoToMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : null;
}

export function asStr(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (v == null) return fallback;
  return String(v);
}

export function asNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function asNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function asSetType(v: unknown): SetType {
  return isSetType(v) ? v : 'working';
}

export function exerciseRefToCloud(ref: ExerciseRef | undefined): {
  ref_type: string;
  catalog_external_id: string | null;
  user_exercise_id: string | null;
} {
  if (!ref || ref.ref === 'unknown') {
    return { ref_type: 'catalog', catalog_external_id: 'unknown', user_exercise_id: null };
  }
  if (ref.ref === 'catalog') {
    return { ref_type: 'catalog', catalog_external_id: ref.externalId, user_exercise_id: null };
  }
  return { ref_type: 'custom', catalog_external_id: null, user_exercise_id: ref.exerciseUuid };
}

export function cloudToExerciseRef(row: {
  ref_type?: string;
  catalog_external_id?: string | null;
  user_exercise_id?: string | null;
}): ExerciseRef {
  if (row.ref_type === 'custom' && row.user_exercise_id) {
    return { ref: 'custom', exerciseUuid: row.user_exercise_id };
  }
  if (row.catalog_external_id) {
    return { ref: 'catalog', externalId: row.catalog_external_id };
  }
  return { ref: 'unknown' };
}

export function templateRefToCloud(ref: TemplateRef | undefined): {
  ref_type: string;
  user_template_id: string | null;
  seed_template_id: number | null;
} {
  if (!ref || ref.ref === 'unknown') {
    return { ref_type: 'seed', user_template_id: null, seed_template_id: null };
  }
  if (ref.ref === 'custom') {
    return { ref_type: 'custom', user_template_id: ref.templateUuid, seed_template_id: null };
  }
  return { ref_type: 'seed', user_template_id: null, seed_template_id: ref.seedTemplateId };
}

export function cloudToTemplateRef(row: {
  ref_type?: string;
  user_template_id?: string | null;
  seed_template_id?: number | null;
}): TemplateRef {
  if (row.ref_type === 'custom' && row.user_template_id) {
    return { ref: 'custom', templateUuid: row.user_template_id };
  }
  if (row.seed_template_id != null && Number.isFinite(Number(row.seed_template_id))) {
    return { ref: 'seed', seedTemplateId: Number(row.seed_template_id) };
  }
  return { ref: 'unknown' };
}

function baseCloudRow(
  id: string,
  userId: string,
  updatedAt: number,
  deletedAt: number | null,
): Record<string, unknown> {
  return {
    id,
    user_id: userId,
    updated_at: msToIso(updatedAt),
    deleted_at: msToIso(deletedAt),
  };
}

/** Map an outbox payload onto the cloud upsert row for a known table (not profiles). */
export function buildCloudUpsertRow(
  cloudTable: string,
  rowUuid: string,
  userId: string,
  payload: Record<string, unknown>,
  updatedAt: number,
  deletedAt: number | null,
): Record<string, unknown> {
  const row = baseCloudRow(rowUuid, userId, updatedAt, deletedAt);

  if (cloudTable === 'user_exercises') {
    return {
      ...row,
      name: payload.name,
      primary_muscle: payload.primary_muscle,
      movement_pattern: payload.movement_pattern,
      equipment: payload.equipment,
      category: payload.category,
      is_compound: !!(payload.is_compound),
      tips: payload.tips ?? '',
      aliases: payload.aliases ?? [],
      secondary_muscles: payload.secondary_muscles ?? [],
      instructions: payload.instructions ?? [],
      created_at: msToIso(payload.created_at as number) ?? msToIso(updatedAt),
    };
  }

  if (cloudTable === 'user_templates') {
    return {
      ...row,
      name: payload.name,
      description: payload.description ?? '',
      category: payload.category ?? 'strength',
      difficulty: payload.difficulty ?? 'intermediate',
      estimated_minutes: payload.estimated_minutes ?? 45,
      created_at: msToIso(payload.created_at as number) ?? msToIso(updatedAt),
    };
  }

  if (cloudTable === 'user_template_exercises') {
    const ex = exerciseRefToCloud(payload.exercise_ref as ExerciseRef | undefined);
    return {
      ...row,
      template_id: payload.template_uuid,
      ...ex,
      sort_order: payload.sort_order ?? 0,
      target_sets: payload.target_sets ?? 3,
      target_reps_min: payload.target_reps_min ?? 8,
      target_reps_max: payload.target_reps_max ?? 12,
      rest_seconds: payload.rest_seconds ?? 90,
      notes: payload.notes ?? '',
      superset_group: payload.superset_group ?? null,
    };
  }

  if (cloudTable === 'workout_logs') {
    return {
      ...row,
      template_id: payload.template_uuid ?? null,
      name: payload.name,
      started_at: msToIso(payload.started_at as number),
      ended_at: msToIso(payload.ended_at as number | null),
      duration_seconds: payload.duration_seconds ?? 0,
      total_volume: payload.total_volume ?? 0,
      unit: payload.unit ?? 'metric',
      notes: payload.notes ?? '',
      created_at: msToIso(payload.created_at as number) ?? msToIso(updatedAt),
    };
  }

  if (cloudTable === 'set_entries') {
    const ex = exerciseRefToCloud(payload.exercise_ref as ExerciseRef | undefined);
    return {
      ...row,
      workout_log_id: payload.workout_log_uuid,
      ...ex,
      set_index: payload.set_index ?? 0,
      weight: payload.weight ?? 0,
      reps: payload.reps ?? 0,
      completed: !!(payload.completed),
      rest_seconds: payload.rest_seconds ?? null,
      superset_group: payload.superset_group ?? null,
      set_type: asSetType(payload.set_type),
      rpe: payload.rpe ?? null,
      created_at: msToIso(payload.created_at as number) ?? msToIso(updatedAt),
    };
  }

  if (cloudTable === 'bodyweight_entries') {
    return {
      ...row,
      weight: payload.weight,
      unit: payload.unit ?? 'kg',
      recorded_at: msToIso(payload.recorded_at as number),
      created_at: msToIso(payload.created_at as number) ?? msToIso(updatedAt),
    };
  }

  if (cloudTable === 'body_measurements') {
    return {
      ...row,
      metric: payload.metric,
      value: payload.value,
      unit: payload.unit ?? 'cm',
      recorded_at: msToIso(payload.recorded_at as number),
      created_at: msToIso(payload.created_at as number) ?? msToIso(updatedAt),
    };
  }

  if (cloudTable === 'user_programs') {
    return {
      ...row,
      name: payload.name,
      description: payload.description ?? '',
      weeks: payload.weeks ?? 4,
      created_at: msToIso(payload.created_at as number) ?? msToIso(updatedAt),
    };
  }

  if (cloudTable === 'user_program_workouts') {
    const tpl = templateRefToCloud(payload.template_ref as TemplateRef | undefined);
    return {
      ...row,
      program_id: payload.program_uuid,
      ...tpl,
      week: payload.week ?? 1,
      day: payload.day ?? 1,
      sort_order: payload.sort_order ?? 0,
    };
  }

  if (cloudTable === 'workout_photos') {
    return {
      ...row,
      workout_log_id: payload.workout_log_uuid,
      storage_path: payload.storage_path ?? null,
      content_type: payload.content_type ?? 'image/jpeg',
      byte_size: payload.byte_size ?? null,
      checksum: payload.checksum ?? null,
      sort_order: payload.sort_order ?? 0,
      created_at: msToIso(payload.created_at as number) ?? msToIso(updatedAt),
    };
  }

  return row;
}

/** One element of the `sync_push` RPC's p_ops array (see supabase/sync-schema.sql). */
export interface PushOp {
  op: SyncOp;
  row: Record<string, unknown>;
}

function singletonPushOp(
  table: 'profiles' | 'user_active_program' | 'user_preferences',
  userId: string,
  op: SyncOp,
  payload: Record<string, unknown>,
  updatedAt: number,
  deletedAt: number | null,
): PushOp {
  const updated_at = msToIso(updatedAt);

  if (table === 'profiles') {
    if (op === 'delete') {
      return {
        op: 'delete',
        row: { user_id: userId, updated_at, deleted_at: msToIso(deletedAt ?? updatedAt) },
      };
    }
    return {
      op: 'upsert',
      row: {
        user_id: userId,
        name: payload.name ?? '',
        goal: payload.goal ?? 'build_muscle',
        bodyweight: payload.bodyweight ?? null,
        unit: payload.unit ?? 'metric',
        experience_level: payload.experience_level ?? 'intermediate',
        onboarding_completed: !!payload.onboarding_completed,
        avatar_url: payload.avatar_url ?? null,
        updated_at,
        deleted_at: msToIso(deletedAt),
      },
    };
  }

  if (table === 'user_active_program') {
    // Clearing the active program is a full-row upsert of nulls + tombstone,
    // so it lands even when the cloud never had a row.
    if (op === 'delete' || deletedAt != null) {
      return {
        op: 'upsert',
        row: {
          user_id: userId,
          custom_program_id: null,
          seed_program_id: null,
          started_at: null,
          updated_at,
          deleted_at: msToIso(deletedAt ?? updatedAt),
        },
      };
    }
    return {
      op: 'upsert',
      row: {
        user_id: userId,
        custom_program_id: payload.custom_program_uuid ?? null,
        seed_program_id: payload.seed_program_id ?? null,
        started_at: msToIso(payload.started_at as number),
        updated_at,
        deleted_at: null,
      },
    };
  }

  return {
    op: 'upsert',
    row: {
      user_id: userId,
      payload: {
        themeMode: payload.themeMode,
        accentTheme: payload.accentTheme,
        calendarHeatMetric: payload.calendarHeatMetric,
        weekStartsOn: payload.weekStartsOn,
        weeklyWorkoutGoal: payload.weeklyWorkoutGoal,
        enabledBodyMetrics: payload.enabledBodyMetrics,
        showWarmUpSets: payload.showWarmUpSets,
        showRpe: payload.showRpe,
        autoStartRest: payload.autoStartRest,
        defaultRestSeconds: payload.defaultRestSeconds,
        showSessionGhost: payload.showSessionGhost,
      },
      updated_at,
      deleted_at: msToIso(deletedAt),
    },
  };
}

/**
 * Map one outbox row to its `sync_push` op. Throws on an unreadable payload
 * (the caller counts it as a failed attempt). Deletes on id-keyed tables are
 * tombstone-only: their payloads carry just updated_at / deleted_at.
 */
export function buildPushOp(
  table: SyncTable,
  item: { rowUuid: string; op: SyncOp; payload: string | null },
  userId: string,
  nowMs = Date.now(),
): PushOp {
  const payload = item.payload ? (JSON.parse(item.payload) as Record<string, unknown>) : {};
  const updatedAt = typeof payload.updated_at === 'number' ? payload.updated_at : nowMs;
  const deletedAt = typeof payload.deleted_at === 'number' ? payload.deleted_at : null;

  if (table === 'profiles' || table === 'user_active_program' || table === 'user_preferences') {
    return singletonPushOp(table, userId, item.op, payload, updatedAt, deletedAt);
  }
  if (item.op === 'delete') {
    return {
      op: 'delete',
      row: baseCloudRow(item.rowUuid, userId, updatedAt, deletedAt ?? updatedAt),
    };
  }
  return {
    op: 'upsert',
    row: buildCloudUpsertRow(table, item.rowUuid, userId, payload, updatedAt, deletedAt),
  };
}
