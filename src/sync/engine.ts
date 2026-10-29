import type { SupabaseClient } from '@supabase/supabase-js';

import { openDatabase } from '@/db/client';
import { captureError } from '@/lib/error-sink';
import { newUuid } from '@/lib/uuid';
import { buildSearchText } from '@/lib/exercise-search';
import type { SyncTable } from './types';
import { quarantinedOutboxCount } from './outbox';
import { getTableCursors, setSyncStatus, setTableCursor } from './state';
import { getSyncClient, syncBackendReady, type GetToken } from './supabase-auth';
import { resolveExerciseRef } from './exercise-ref';
import {
  asNum,
  asNumOrNull,
  asSetType,
  asStr,
  cloudToExerciseRef,
  cloudToTemplateRef,
  isoToMs,
} from './mappers';
import { PULL_TABLES } from './tables';
import type { ApplyStatus } from './cursor';
import { MAX_PUSH_ATTEMPTS, pushOutbox, supabasePushRpc } from './push';
import { pullTable, supabasePullSource } from './pull';
import { resolveTemplateRef } from './template-ref';
import { drainPhotoBlobs, enqueuePhotoBlob, localPhotoPath } from './photo-blobs';
import { File } from 'expo-file-system';
import { kvStorage } from '@/db/kv';
import { ACTIVE_PROGRAM_KEY } from '@/db/queries/programs';
import { applyRemoteAccountPrefs } from '@/store/settings-store';
import { ACCOUNT_PREFS_UPDATED_AT_KEY } from './account-prefs';

export async function applyRemoteRow(
  table: SyncTable,
  remote: Record<string, unknown>,
  userId: string,
): Promise<ApplyStatus> {
  const db = await openDatabase();
  const updatedAt = isoToMs(asStr(remote.updated_at)) ?? Date.now();
  const deletedAt = isoToMs(remote.deleted_at as string | null);

  if (table === 'profiles') {
    const local = await db.getFirstAsync<{
      updated_at: number;
      uuid: string | null;
      name: string;
      onboarding_completed: number;
    }>(
      'SELECT updated_at, uuid, name, onboarding_completed FROM user_profile WHERE id = 1',
    );
    const localIsPlaceholder =
      !local || (!(local.name ?? '').trim() && !local.onboarding_completed);
    // Placeholder rows must never beat a real cloud profile (common after account wipe).
    if (local && !localIsPlaceholder && local.updated_at > updatedAt) return 'ok';
    const uuid = local?.uuid ?? newUuid();
    await db.runAsync(
      `INSERT INTO user_profile (id, name, goal, bodyweight, unit, experience_level, onboarding_completed, avatar_url, uuid, deleted_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, goal = excluded.goal, bodyweight = excluded.bodyweight,
         unit = excluded.unit, experience_level = excluded.experience_level,
         onboarding_completed = excluded.onboarding_completed, avatar_url = excluded.avatar_url,
         uuid = excluded.uuid, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at`,
      asStr(remote.name),
      asStr(remote.goal, 'build_muscle'),
      asNumOrNull(remote.bodyweight),
      asStr(remote.unit, 'metric'),
      asStr(remote.experience_level, 'intermediate'),
      remote.onboarding_completed ? 1 : 0,
      remote.avatar_url == null ? null : asStr(remote.avatar_url),
      uuid,
      deletedAt,
      updatedAt,
    );
    return 'ok';
  }

  if (table === 'user_active_program') {
    const localRaw = await kvStorage.getItem(ACTIVE_PROGRAM_KEY);
    let localUpdated = 0;
    if (localRaw) {
      try {
        const parsed = JSON.parse(localRaw) as { updatedAt?: number };
        localUpdated = parsed.updatedAt ?? 0;
      } catch {
        localUpdated = 0;
      }
    }
    if (localUpdated > updatedAt) return 'ok';
    if (deletedAt) {
      await kvStorage.removeItem(ACTIVE_PROGRAM_KEY);
      return 'ok';
    }
    const startedAt = isoToMs(asStr(remote.started_at)) ?? updatedAt;
    const customUuid = remote.custom_program_id ? asStr(remote.custom_program_id) : '';
    const seedId = asNumOrNull(remote.seed_program_id);
    let programId: number | null = null;
    if (customUuid) {
      const p = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM programs WHERE uuid = ? AND is_custom = 1 AND deleted_at IS NULL',
        customUuid,
      );
      if (!p) return 'blocked';
      programId = p.id;
    } else if (seedId != null) {
      const p = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM programs WHERE id = ? AND is_custom = 0 AND deleted_at IS NULL',
        seedId,
      );
      if (!p) return 'blocked';
      programId = p.id;
    } else {
      await kvStorage.removeItem(ACTIVE_PROGRAM_KEY);
      return 'ok';
    }
    await kvStorage.setItem(
      ACTIVE_PROGRAM_KEY,
      JSON.stringify({ programId, startedAt, updatedAt }),
    );
    return 'ok';
  }

  if (table === 'user_preferences') {
    const raw = await kvStorage.getItem(ACCOUNT_PREFS_UPDATED_AT_KEY);
    const localUpdated = raw ? Number(raw) : 0;
    if (Number.isFinite(localUpdated) && localUpdated > updatedAt) return 'ok';
    const payload =
      remote.payload && typeof remote.payload === 'object'
        ? (remote.payload as Record<string, unknown>)
        : remote;
    applyRemoteAccountPrefs(payload);
    await kvStorage.setItem(ACCOUNT_PREFS_UPDATED_AT_KEY, String(updatedAt));
    return 'ok';
  }

  const id = asStr(remote.id);
  if (table === 'user_exercises') {
    const local = await db.getFirstAsync<{ id: number; updated_at: number }>(
      'SELECT id, updated_at FROM exercises WHERE uuid = ?',
      id,
    );
    if (local && local.updated_at > updatedAt) return 'ok';
    if (local) {
      await db.runAsync(
        `UPDATE exercises SET name = ?, primary_muscle = ?, movement_pattern = ?, equipment = ?, category = ?,
         is_compound = ?, tips = ?, search_text = ?, updated_at = ?, deleted_at = ? WHERE id = ?`,
        asStr(remote.name),
        asStr(remote.primary_muscle),
        remote.movement_pattern == null ? null : asStr(remote.movement_pattern),
        asStr(remote.equipment),
        asStr(remote.category),
        remote.is_compound ? 1 : 0,
        asStr(remote.tips),
        buildSearchText({
          name: asStr(remote.name),
          primaryMuscle: asStr(remote.primary_muscle),
          equipment: asStr(remote.equipment),
          pattern: remote.movement_pattern == null ? null : asStr(remote.movement_pattern),
          category: asStr(remote.category),
        }),
        updatedAt,
        deletedAt,
        local.id,
      );
    } else if (!deletedAt) {
      const created = isoToMs(asStr(remote.created_at)) ?? updatedAt;
      await db.runAsync(
        `INSERT INTO exercises (name, primary_muscle, movement_pattern, equipment, category, is_compound, is_custom, source, tips, search_text, uuid, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 'custom', ?, ?, ?, ?, ?, ?)`,
        asStr(remote.name),
        asStr(remote.primary_muscle),
        remote.movement_pattern == null ? null : asStr(remote.movement_pattern),
        asStr(remote.equipment),
        asStr(remote.category),
        remote.is_compound ? 1 : 0,
        asStr(remote.tips),
        buildSearchText({
          name: asStr(remote.name),
          primaryMuscle: asStr(remote.primary_muscle),
          equipment: asStr(remote.equipment),
          pattern: remote.movement_pattern == null ? null : asStr(remote.movement_pattern),
          category: asStr(remote.category),
        }),
        id,
        created,
        updatedAt,
        deletedAt,
      );
    }
    return 'ok';
  }

  if (table === 'user_templates') {
    const local = await db.getFirstAsync<{ id: number; updated_at: number }>(
      'SELECT id, updated_at FROM workout_templates WHERE uuid = ?',
      id,
    );
    if (local && local.updated_at > updatedAt) return 'ok';
    if (local) {
      await db.runAsync(
        `UPDATE workout_templates SET name = ?, description = ?, category = ?, difficulty = ?, estimated_minutes = ?, updated_at = ?, deleted_at = ? WHERE id = ?`,
        asStr(remote.name),
        asStr(remote.description),
        asStr(remote.category, 'strength'),
        asStr(remote.difficulty, 'intermediate'),
        asNum(remote.estimated_minutes, 45),
        updatedAt,
        deletedAt,
        local.id,
      );
    } else if (!deletedAt) {
      const created = isoToMs(asStr(remote.created_at)) ?? updatedAt;
      await db.runAsync(
        `INSERT INTO workout_templates (name, description, category, difficulty, estimated_minutes, is_custom, uuid, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        asStr(remote.name),
        asStr(remote.description),
        asStr(remote.category, 'strength'),
        asStr(remote.difficulty, 'intermediate'),
        asNum(remote.estimated_minutes, 45),
        id,
        created,
        updatedAt,
        deletedAt,
      );
    }
    return 'ok';
  }

  if (table === 'user_template_exercises') {
    const local = await db.getFirstAsync<{ id: number; updated_at: number | null }>(
      'SELECT id, updated_at FROM template_exercises WHERE uuid = ?',
      id,
    );
    if (local && (local.updated_at ?? 0) > updatedAt) return 'ok';
    const template = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM workout_templates WHERE uuid = ?',
      asStr(remote.template_id),
    );
    if (!template) return 'blocked';
    const exId = await resolveExerciseRef(cloudToExerciseRef(remote as never));
    if (exId == null && !deletedAt) return 'blocked';
    if (local) {
      await db.runAsync(
        `UPDATE template_exercises SET exercise_id = COALESCE(?, exercise_id), sort_order = ?, target_sets = ?, target_reps_min = ?, target_reps_max = ?, rest_seconds = ?, notes = ?, superset_group = ?, updated_at = ?, deleted_at = ? WHERE id = ?`,
        exId,
        asNum(remote.sort_order),
        asNum(remote.target_sets, 3),
        asNum(remote.target_reps_min, 8),
        asNum(remote.target_reps_max, 12),
        asNum(remote.rest_seconds, 90),
        asStr(remote.notes),
        asNumOrNull(remote.superset_group),
        updatedAt,
        deletedAt,
        local.id,
      );
    } else if (!deletedAt && exId != null) {
      await db.runAsync(
        `INSERT INTO template_exercises (template_id, exercise_id, sort_order, target_sets, target_reps_min, target_reps_max, rest_seconds, notes, superset_group, uuid, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        template.id,
        exId,
        asNum(remote.sort_order),
        asNum(remote.target_sets, 3),
        asNum(remote.target_reps_min, 8),
        asNum(remote.target_reps_max, 12),
        asNum(remote.rest_seconds, 90),
        asStr(remote.notes),
        asNumOrNull(remote.superset_group),
        id,
        updatedAt,
        deletedAt,
      );
    }
    return 'ok';
  }

  if (table === 'workout_logs') {
    const local = await db.getFirstAsync<{ id: number; updated_at: number }>(
      'SELECT id, updated_at FROM workout_logs WHERE uuid = ?',
      id,
    );
    if (local && local.updated_at > updatedAt) return 'ok';
    let templateId: number | null = null;
    if (remote.template_id) {
      const t = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM workout_templates WHERE uuid = ?',
        asStr(remote.template_id),
      );
      templateId = t?.id ?? null;
    }
    const startedAt = isoToMs(asStr(remote.started_at)) ?? updatedAt;
    const endedAt = isoToMs(remote.ended_at as string | null);
    if (local) {
      await db.runAsync(
        `UPDATE workout_logs SET template_id = ?, name = ?, started_at = ?, ended_at = ?, duration_seconds = ?, total_volume = ?, unit = ?, notes = ?, updated_at = ?, deleted_at = ? WHERE id = ?`,
        templateId,
        asStr(remote.name),
        startedAt,
        endedAt,
        asNum(remote.duration_seconds),
        asNum(remote.total_volume),
        asStr(remote.unit, 'metric'),
        asStr(remote.notes),
        updatedAt,
        deletedAt,
        local.id,
      );
    } else if (!deletedAt) {
      const created = isoToMs(asStr(remote.created_at)) ?? updatedAt;
      await db.runAsync(
        `INSERT INTO workout_logs (template_id, name, started_at, ended_at, duration_seconds, total_volume, unit, notes, uuid, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        templateId,
        asStr(remote.name),
        startedAt,
        endedAt,
        asNum(remote.duration_seconds),
        asNum(remote.total_volume),
        asStr(remote.unit, 'metric'),
        asStr(remote.notes),
        id,
        created,
        updatedAt,
        deletedAt,
      );
    }
    return 'ok';
  }

  if (table === 'set_entries') {
    const local = await db.getFirstAsync<{ id: number; updated_at: number }>(
      'SELECT id, updated_at FROM set_entries WHERE uuid = ?',
      id,
    );
    if (local && local.updated_at > updatedAt) return 'ok';
    const log = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM workout_logs WHERE uuid = ?',
      asStr(remote.workout_log_id),
    );
    if (!log) return 'blocked';
    const exId = await resolveExerciseRef(cloudToExerciseRef(remote as never));
    if (exId == null && !deletedAt) return 'blocked';
    if (local) {
      await db.runAsync(
        `UPDATE set_entries SET exercise_id = COALESCE(?, exercise_id), set_index = ?, weight = ?, reps = ?, completed = ?, rest_seconds = ?, superset_group = ?, set_type = ?, rpe = ?, updated_at = ?, deleted_at = ? WHERE id = ?`,
        exId,
        asNum(remote.set_index),
        asNum(remote.weight),
        asNum(remote.reps),
        remote.completed ? 1 : 0,
        asNumOrNull(remote.rest_seconds),
        asNumOrNull(remote.superset_group),
        asSetType(remote.set_type),
        asNumOrNull(remote.rpe),
        updatedAt,
        deletedAt,
        local.id,
      );
    } else if (!deletedAt && exId != null) {
      const created = isoToMs(asStr(remote.created_at)) ?? updatedAt;
      await db.runAsync(
        `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, rest_seconds, superset_group, set_type, rpe, uuid, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        log.id,
        exId,
        asNum(remote.set_index),
        asNum(remote.weight),
        asNum(remote.reps),
        remote.completed ? 1 : 0,
        asNumOrNull(remote.rest_seconds),
        asNumOrNull(remote.superset_group),
        asSetType(remote.set_type),
        asNumOrNull(remote.rpe),
        id,
        created,
        updatedAt,
        deletedAt,
      );
    }
    return 'ok';
  }

  if (table === 'bodyweight_entries') {
    const local = await db.getFirstAsync<{ id: number; updated_at: number }>(
      'SELECT id, updated_at FROM bodyweight_entries WHERE uuid = ?',
      id,
    );
    if (local && local.updated_at > updatedAt) return 'ok';
    const recordedAt = isoToMs(asStr(remote.recorded_at)) ?? updatedAt;
    if (local) {
      await db.runAsync(
        `UPDATE bodyweight_entries SET weight = ?, unit = ?, recorded_at = ?, updated_at = ?, deleted_at = ? WHERE id = ?`,
        asNum(remote.weight),
        asStr(remote.unit, 'kg'),
        recordedAt,
        updatedAt,
        deletedAt,
        local.id,
      );
    } else if (!deletedAt) {
      const created = isoToMs(asStr(remote.created_at)) ?? updatedAt;
      await db.runAsync(
        `INSERT INTO bodyweight_entries (weight, unit, recorded_at, uuid, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        asNum(remote.weight),
        asStr(remote.unit, 'kg'),
        recordedAt,
        id,
        created,
        updatedAt,
        deletedAt,
      );
    }
    return 'ok';
  }

  if (table === 'body_measurements') {
    const local = await db.getFirstAsync<{ id: number; updated_at: number }>(
      'SELECT id, updated_at FROM body_measurements WHERE uuid = ?',
      id,
    );
    if (local && local.updated_at > updatedAt) return 'ok';
    const recordedAt = isoToMs(asStr(remote.recorded_at)) ?? updatedAt;
    if (local) {
      await db.runAsync(
        `UPDATE body_measurements SET metric = ?, value = ?, unit = ?, recorded_at = ?, updated_at = ?, deleted_at = ? WHERE id = ?`,
        asStr(remote.metric),
        asNum(remote.value),
        asStr(remote.unit, 'cm'),
        recordedAt,
        updatedAt,
        deletedAt,
        local.id,
      );
    } else if (!deletedAt) {
      const created = isoToMs(asStr(remote.created_at)) ?? updatedAt;
      await db.runAsync(
        `INSERT INTO body_measurements (metric, value, unit, recorded_at, uuid, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        asStr(remote.metric),
        asNum(remote.value),
        asStr(remote.unit, 'cm'),
        recordedAt,
        id,
        created,
        updatedAt,
        deletedAt,
      );
    }
    return 'ok';
  }

  if (table === 'user_programs') {
    const local = await db.getFirstAsync<{ id: number; updated_at: number }>(
      'SELECT id, updated_at FROM programs WHERE uuid = ?',
      id,
    );
    if (local && local.updated_at > updatedAt) return 'ok';
    if (local) {
      await db.runAsync(
        `UPDATE programs SET name = ?, description = ?, weeks = ?, updated_at = ?, deleted_at = ? WHERE id = ? AND is_custom = 1`,
        asStr(remote.name),
        asStr(remote.description),
        asNum(remote.weeks, 4),
        updatedAt,
        deletedAt,
        local.id,
      );
    } else if (!deletedAt) {
      const created = isoToMs(asStr(remote.created_at)) ?? updatedAt;
      await db.runAsync(
        `INSERT INTO programs (name, description, weeks, is_custom, uuid, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
        asStr(remote.name),
        asStr(remote.description),
        asNum(remote.weeks, 4),
        id,
        created,
        updatedAt,
        deletedAt,
      );
    }
    return 'ok';
  }

  if (table === 'user_program_workouts') {
    const local = await db.getFirstAsync<{ id: number; updated_at: number | null }>(
      'SELECT id, updated_at FROM program_workouts WHERE uuid = ?',
      id,
    );
    if (local && (local.updated_at ?? 0) > updatedAt) return 'ok';
    const program = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM programs WHERE uuid = ? AND is_custom = 1',
      asStr(remote.program_id),
    );
    if (!program) return 'blocked';
    const templateId = await resolveTemplateRef(cloudToTemplateRef(remote as never));
    if (templateId == null && !deletedAt) return 'blocked';
    if (local) {
      await db.runAsync(
        `UPDATE program_workouts SET program_id = ?, template_id = COALESCE(?, template_id), week = ?, day = ?, sort_order = ?, updated_at = ?, deleted_at = ? WHERE id = ?`,
        program.id,
        templateId,
        asNum(remote.week, 1),
        asNum(remote.day, 1),
        asNum(remote.sort_order),
        updatedAt,
        deletedAt,
        local.id,
      );
    } else if (!deletedAt && templateId != null) {
      await db.runAsync(
        `INSERT INTO program_workouts (program_id, template_id, week, day, sort_order, uuid, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        program.id,
        templateId,
        asNum(remote.week, 1),
        asNum(remote.day, 1),
        asNum(remote.sort_order),
        id,
        updatedAt,
        deletedAt,
      );
    }
    return 'ok';
  }

  if (table === 'workout_photos') {
    const local = await db.getFirstAsync<{
      id: number;
      updated_at: number;
      uri: string;
    }>('SELECT id, updated_at, uri FROM workout_photos WHERE uuid = ?', id);
    if (local && local.updated_at > updatedAt) return 'ok';
    const log = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM workout_logs WHERE uuid = ?',
      asStr(remote.workout_log_id),
    );
    if (!log) return 'blocked';
    const storagePath = remote.storage_path ? asStr(remote.storage_path) : null;
    if (storagePath?.startsWith('http')) return 'ok';
    const dest = localPhotoPath(log.id, id);
    const keepLocal =
      local?.uri && !local.uri.startsWith('http') && new File(local.uri).exists
        ? local.uri
        : dest;
    if (local) {
      await db.runAsync(
        `UPDATE workout_photos SET workout_log_id = ?, storage_path = ?, content_type = ?, byte_size = ?, checksum = ?, sort_order = ?, updated_at = ?, deleted_at = ?, uri = ? WHERE id = ?`,
        log.id,
        storagePath,
        asStr(remote.content_type, 'image/jpeg'),
        asNumOrNull(remote.byte_size),
        remote.checksum == null ? null : asStr(remote.checksum),
        asNum(remote.sort_order),
        updatedAt,
        deletedAt,
        keepLocal,
        local.id,
      );
    } else if (!deletedAt) {
      const created = isoToMs(asStr(remote.created_at)) ?? updatedAt;
      await db.runAsync(
        `INSERT INTO workout_photos (workout_log_id, uri, sort_order, uuid, created_at, updated_at, deleted_at, storage_path, content_type, byte_size, checksum)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        log.id,
        dest,
        asNum(remote.sort_order),
        id,
        created,
        updatedAt,
        deletedAt,
        storagePath,
        asStr(remote.content_type, 'image/jpeg'),
        asNumOrNull(remote.byte_size),
        remote.checksum == null ? null : asStr(remote.checksum),
      );
    }
    if (!deletedAt && storagePath && !new File(keepLocal).exists) {
      // Same connection, so this joins applyPage's transaction (#138).
      await enqueuePhotoBlob(id, 'download', storagePath, db);
    }
    return 'ok';
  }

  void userId;
  return 'ok';
}

/** Apply one pulled page in a single SQLite transaction (#140): all-or-nothing per page. */
async function applyPage(
  table: SyncTable,
  rows: Record<string, unknown>[],
  userId: string,
): Promise<ApplyStatus[]> {
  const db = await openDatabase();
  const statuses: ApplyStatus[] = [];
  await db.withTransactionAsync(async () => {
    for (const row of rows) statuses.push(await applyRemoteRow(table, row, userId));
  });
  return statuses;
}

async function pullAll(client: SupabaseClient, userId: string): Promise<void> {
  // If local profile is still an empty placeholder, always fetch the cloud row
  // (ignores cursor). Fixes account-switch races where workouts pulled but name did not.
  const db = await openDatabase();
  const localProfile = await db.getFirstAsync<{ name: string; onboarding_completed: number }>(
    'SELECT name, onboarding_completed FROM user_profile WHERE id = 1 AND deleted_at IS NULL',
  );
  const needsProfileHydrate =
    !localProfile || (!(localProfile.name ?? '').trim() && !localProfile.onboarding_completed);
  if (needsProfileHydrate) {
    const res = await client.from('profiles').select('*').eq('user_id', userId).maybeSingle();
    if (res.error) throw res.error;
    if (res.data) await applyRemoteRow('profiles', res.data as Record<string, unknown>, userId);
  }

  const source = supabasePullSource(client, userId);
  const cursors = await getTableCursors(PULL_TABLES.map((t) => t.table));
  for (const spec of PULL_TABLES) {
    if (spec.table === 'profiles' && needsProfileHydrate) continue;
    await pullTable(
      spec,
      cursors[spec.table],
      source,
      (table, rows) => applyPage(table, rows, userId),
      (cursor) => setTableCursor(spec.table, cursor),
    );
  }
}

let _running = false;

export interface SyncResult {
  ok: boolean;
  pushed: number;
  error?: string;
}

/**
 * Push outbox then pull remote changes. Safe to call frequently; coalesces concurrent runs.
 */
export async function runSync(opts: {
  userId: string;
  getToken: GetToken;
}): Promise<SyncResult> {
  if (_running) return { ok: true, pushed: 0 };
  if (!syncBackendReady()) {
    return { ok: false, pushed: 0, error: 'Supabase not configured' };
  }

  _running = true;
  await setSyncStatus({ status: 'syncing', lastError: null });

  try {
    // Token pre-flight is local: a misconfigured / wrong-audience token stops
    // here with a clear status and never touches outbox attempts (#201).
    const auth = await getSyncClient(opts.getToken, opts.userId);
    if (!auth.ok) {
      await setSyncStatus({ status: 'error', lastError: auth.reason });
      return { ok: false, pushed: 0, error: auth.reason };
    }
    const client = auth.client;

    const { pushed, tableErrors } = await pushOutbox(opts.userId, supabasePushRpc(client));
    await setSyncStatus({ lastPushAt: Date.now() });

    await pullAll(client, opts.userId);

    void drainPhotoBlobs(opts).catch((err) => captureError(err, { where: 'photos.drain' }));

    // A table whose push call failed outright is retried next run; the
    // others already went out. Surface it rather than reporting idle.
    const pushError = tableErrors.find((e) => !e.blockedBy);
    if (pushError) {
      await setSyncStatus({ status: 'error', lastError: pushError.message, lastPullAt: Date.now() });
      return { ok: false, pushed, error: pushError.message };
    }

    const parked = await quarantinedOutboxCount(MAX_PUSH_ATTEMPTS);
    await setSyncStatus({
      status: 'idle',
      lastError: parked > 0
        ? `${parked} change${parked === 1 ? '' : 's'} could not upload — editing ${parked === 1 ? 'it' : 'them'} again retries`
        : null,
      lastPullAt: Date.now(),
    });

    return { ok: true, pushed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[sync] runSync failed', err);
    await setSyncStatus({ status: 'error', lastError: message });
    return { ok: false, pushed: 0, error: message };
  } finally {
    _running = false;
  }
}

/** True when local has no completed workouts and no custom data (candidate for full hydrate). */
export async function isLocalUserDataEmpty(): Promise<boolean> {
  const db = await openDatabase();
  const logs = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM workout_logs WHERE deleted_at IS NULL',
  );
  const customs = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM exercises WHERE is_custom = 1 AND deleted_at IS NULL',
  );
  const templates = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM workout_templates WHERE is_custom = 1 AND deleted_at IS NULL',
  );
  const measurements = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM body_measurements WHERE deleted_at IS NULL',
  );
  const programs = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM programs WHERE is_custom = 1 AND deleted_at IS NULL',
  );
  return (
    (logs?.c ?? 0) === 0 &&
    (customs?.c ?? 0) === 0 &&
    (templates?.c ?? 0) === 0 &&
    (measurements?.c ?? 0) === 0 &&
    (programs?.c ?? 0) === 0
  );
}
