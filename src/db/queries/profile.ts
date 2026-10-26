import { openDatabase } from '../client';
import { newUuid } from '@/lib/uuid';
import { queryClient } from '@/lib/query-client';
import { clearOutbox, enqueueSync } from '@/sync/outbox';
import { resetSyncState } from '@/sync/state';
import type { ExperienceLevel, Goal, Unit, UserProfile } from '../types';
import { mutate, type Tx } from '../write';
import {
  mapProfile,
  type ProfileRow,
} from './helpers';
import { ACTIVE_PROGRAM_KEY } from './programs';

const PROFILE_TABLES = ['user_profile'] as const;

/** Every table resetUserData wipes (kv: coach narration + active program). */
const RESET_TABLES = [
  'set_entries',
  'workout_photos',
  'photo_blob_queue',
  'workout_logs',
  'session_exercise_notes',
  'bodyweight_entries',
  'body_measurements',
  'user_profile',
  'template_exercises',
  'workout_templates',
  'exercise_aliases',
  'exercise_secondary_muscles',
  'exercise_instructions',
  'exercise_images',
  'exercises',
  'program_workouts',
  'programs',
  'kv',
] as const;

async function ensureProfileRow(tx: Tx): Promise<{ uuid: string }> {
  const row = await tx.getFirstAsync<ProfileRow>('SELECT * FROM user_profile WHERE id = 1 AND deleted_at IS NULL');
  if (row?.uuid) return { uuid: row.uuid };
  const uuid = row?.uuid ?? newUuid();
  if (!row) {
    // updated_at = 0 so any cloud profile wins LWW until the user actually edits/onboards.
    await tx.runAsync(
      `INSERT INTO user_profile (id, name, goal, bodyweight, unit, experience_level, onboarding_completed, uuid, updated_at)
       VALUES (1, '', 'build_muscle', NULL, 'metric', 'intermediate', 0, ?, 0)`,
      uuid,
    );
  } else if (!row.uuid) {
    await tx.runAsync('UPDATE user_profile SET uuid = ? WHERE id = 1', uuid);
  }
  return { uuid };
}

export async function getProfile(): Promise<UserProfile> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<ProfileRow>('SELECT * FROM user_profile WHERE id = 1 AND deleted_at IS NULL');
  if (!row) {
    await mutate(PROFILE_TABLES, (tx) => ensureProfileRow(tx));
    const now = Date.now();
    return {
      id: 1,
      name: '',
      goal: 'build_muscle',
      bodyweight: null,
      unit: 'metric',
      experienceLevel: 'intermediate',
      onboardingCompleted: false,
      avatarUrl: null,
      updatedAt: now,
    };
  }
  return mapProfile(row);
}

export async function saveProfile(patch: Partial<Pick<UserProfile, 'name' | 'goal' | 'bodyweight' | 'unit' | 'experienceLevel' | 'avatarUrl'>>): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.name !== undefined) { sets.push('name = ?'); args.push(patch.name); }
  if (patch.goal !== undefined) { sets.push('goal = ?'); args.push(patch.goal); }
  if (patch.bodyweight !== undefined) { sets.push('bodyweight = ?'); args.push(patch.bodyweight); }
  if (patch.unit !== undefined) { sets.push('unit = ?'); args.push(patch.unit); }
  if (patch.experienceLevel !== undefined) { sets.push('experience_level = ?'); args.push(patch.experienceLevel); }
  if (patch.avatarUrl !== undefined) { sets.push('avatar_url = ?'); args.push(patch.avatarUrl); }
  if (sets.length === 0) {
    await mutate(PROFILE_TABLES, (tx) => ensureProfileRow(tx));
    return;
  }
  sets.push('updated_at = ?');
  args.push(Date.now());
  args.push(1);
  await mutate(PROFILE_TABLES, async (tx) => {
    const { uuid } = await ensureProfileRow(tx);
    await tx.runAsync(`UPDATE user_profile SET ${sets.join(', ')} WHERE id = ?`, ...args);
    const row = await tx.getFirstAsync<ProfileRow>('SELECT * FROM user_profile WHERE id = 1');
    if (!row) return;
    await enqueueSync('profiles', uuid, 'upsert', {
      name: row.name,
      goal: row.goal,
      bodyweight: row.bodyweight,
      unit: row.unit,
      experience_level: row.experience_level,
      onboarding_completed: row.onboarding_completed,
      avatar_url: row.avatar_url,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
    }, tx);
  });
}

export async function completeOnboarding(patch: { name: string; goal: Goal; unit: Unit; experienceLevel?: ExperienceLevel; bodyweight?: number }): Promise<void> {
  const now = Date.now();
  await mutate(PROFILE_TABLES, async (tx) => {
    const { uuid } = await ensureProfileRow(tx);
    await tx.runAsync(
      `UPDATE user_profile SET name = ?, goal = ?, bodyweight = ?, unit = ?, experience_level = ?, onboarding_completed = 1, updated_at = ? WHERE id = 1`,
      patch.name, patch.goal, patch.bodyweight ?? null, patch.unit, patch.experienceLevel ?? 'intermediate', now,
    );
    await enqueueSync('profiles', uuid, 'upsert', {
      name: patch.name,
      goal: patch.goal,
      bodyweight: patch.bodyweight ?? null,
      unit: patch.unit,
      experience_level: patch.experienceLevel ?? 'intermediate',
      onboarding_completed: 1,
      avatar_url: null,
      updated_at: now,
      deleted_at: null,
    }, tx);
  });
}

/**
 * Clear all user-owned local data (logs, bodyweight, profile, custom exercises,
 * custom templates, custom programs, active program, outbox, sync cursors).
 * Keeps catalog exercises and seed templates. All row deletes are one
 * mutate() transaction, so a failure leaves the previous data intact; photo
 * files are removed only after the wipe commits.
 */
export async function resetUserData(): Promise<void> {
  // Drop every cached query first: ids restart after a full wipe, so a stale
  // entry could otherwise resurrect another account's session or exercises.
  queryClient.clear();
  await mutate(RESET_TABLES, async (tx) => {
    await tx.execAsync('DELETE FROM set_entries');
    await tx.execAsync('DELETE FROM workout_photos');
    await tx.execAsync('DELETE FROM photo_blob_queue');
    await tx.execAsync('DELETE FROM workout_logs');
    await tx.execAsync('DELETE FROM session_exercise_notes');
    await tx.execAsync('DELETE FROM bodyweight_entries');
    await tx.execAsync('DELETE FROM body_measurements');
    await tx.execAsync('DELETE FROM user_profile');

    // Soft-deleted or live custom template exercises → remove custom templates
    await tx.execAsync(`
      DELETE FROM template_exercises WHERE template_id IN (
        SELECT id FROM workout_templates WHERE is_custom = 1
      )
    `);
    await tx.execAsync('DELETE FROM workout_templates WHERE is_custom = 1');

    // Custom exercises + children (CASCADE may not fire with plain DELETE if FKs off mid-wipe)
    await tx.execAsync(`
      DELETE FROM exercise_aliases WHERE exercise_id IN (SELECT id FROM exercises WHERE is_custom = 1)
    `);
    await tx.execAsync(`
      DELETE FROM exercise_secondary_muscles WHERE exercise_id IN (SELECT id FROM exercises WHERE is_custom = 1)
    `);
    await tx.execAsync(`
      DELETE FROM exercise_instructions WHERE exercise_id IN (SELECT id FROM exercises WHERE is_custom = 1)
    `);
    await tx.execAsync(`
      DELETE FROM exercise_images WHERE exercise_id IN (SELECT id FROM exercises WHERE is_custom = 1)
    `);
    await tx.execAsync('DELETE FROM exercises WHERE is_custom = 1');

    // Custom programs
    await tx.execAsync(`
      DELETE FROM program_workouts WHERE program_id IN (
        SELECT id FROM programs WHERE is_custom = 1
      )
    `);
    await tx.execAsync('DELETE FROM programs WHERE is_custom = 1');

    await tx.runAsync("DELETE FROM kv WHERE key LIKE 'coach.narrate.%'");
    // Local only: the outbox is wiped below, so no active-program delete is queued.
    await tx.runAsync('DELETE FROM kv WHERE key = ?', ACTIVE_PROGRAM_KEY);

    await clearOutbox(tx);
    await resetSyncState(tx);
  });

  try {
    const { deleteAsync, documentDirectory } = await import('expo-file-system/legacy');
    if (documentDirectory) {
      await deleteAsync(`${documentDirectory}workout-photos`, { idempotent: true });
    }
  } catch {
    // files optional
  }
}

/**
 * Seed sample data for testing: 2 templates + 2 completed workout logs.
 * Returns template IDs for reference.
 */
export async function seedSampleData(): Promise<{ templateIds: number[] }> {
  return mutate(
    ['workout_templates', 'template_exercises', 'workout_logs', 'set_entries', 'user_profile'],
    (tx) => insertSampleData(tx),
  );
}

async function insertSampleData(tx: Tx): Promise<{ templateIds: number[] }> {
  const now = Date.now();
  const DAY = 86_400_000;

  const findId = async (name: string) => {
    const row = await tx.getFirstAsync<{ id: number }>(
      'SELECT id FROM exercises WHERE name LIKE ? AND deleted_at IS NULL LIMIT 1',
      `%${name}%`,
    );
    return row?.id ?? null;
  };

  const t1Uuid = newUuid();
  const t1 = await tx.runAsync(
    `INSERT INTO workout_templates (name, description, category, difficulty, estimated_minutes, is_custom, uuid, created_at, updated_at)
     VALUES (?, ?, 'strength', 'intermediate', 45, 1, ?, ?, ?)`,
    'Upper Body Push', 'Bench, OHP, triceps', t1Uuid, now, now,
  );
  const t1Id = t1.lastInsertRowId as number;

  const benchId = await findId('Bench Press');
  const ohpId = await findId('Overhead Press');
  const triId = await findId('Tricep Pushdown');
  const latId = await findId('Lateral Raise');

  const pushExercises = [
    { id: benchId, order: 0, sets: 4, repsMin: 6, repsMax: 10, rest: 120 },
    { id: ohpId, order: 1, sets: 3, repsMin: 8, repsMax: 12, rest: 90 },
    { id: latId, order: 2, sets: 3, repsMin: 12, repsMax: 15, rest: 60 },
    { id: triId, order: 3, sets: 3, repsMin: 10, repsMax: 15, rest: 60 },
  ].filter((e) => e.id);

  for (const ex of pushExercises) {
    await tx.runAsync(
      `INSERT INTO template_exercises (template_id, exercise_id, sort_order, target_sets, target_reps_min, target_reps_max, rest_seconds, notes, uuid, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?)`,
      t1Id, ex.id, ex.order, ex.sets, ex.repsMin, ex.repsMax, ex.rest, newUuid(), now,
    );
  }

  const t2Uuid = newUuid();
  const t2 = await tx.runAsync(
    `INSERT INTO workout_templates (name, description, category, difficulty, estimated_minutes, is_custom, uuid, created_at, updated_at)
     VALUES (?, ?, 'strength', 'intermediate', 50, 1, ?, ?, ?)`,
    'Lower Body', 'Squat, RDL, leg press', t2Uuid, now, now,
  );
  const t2Id = t2.lastInsertRowId as number;

  const squatId = await findId('Squat');
  const rdlId = await findId('Romanian Deadlift');
  const legExtId = await findId('Leg Extension');
  const legCurlId = await findId('Leg Curl');
  const calfId = await findId('Calf Raise');

  const lowerExercises = [
    { id: squatId, order: 0, sets: 4, repsMin: 6, repsMax: 10, rest: 150 },
    { id: rdlId, order: 1, sets: 3, repsMin: 8, repsMax: 12, rest: 120 },
    { id: legExtId, order: 2, sets: 3, repsMin: 12, repsMax: 15, rest: 60 },
    { id: legCurlId, order: 3, sets: 3, repsMin: 10, repsMax: 15, rest: 60 },
    { id: calfId, order: 4, sets: 4, repsMin: 12, repsMax: 20, rest: 45 },
  ].filter((e) => e.id);

  for (const ex of lowerExercises) {
    await tx.runAsync(
      `INSERT INTO template_exercises (template_id, exercise_id, sort_order, target_sets, target_reps_min, target_reps_max, rest_seconds, notes, uuid, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?)`,
      t2Id, ex.id, ex.order, ex.sets, ex.repsMin, ex.repsMax, ex.rest, newUuid(), now,
    );
  }

  const sampleSessions = [
    { templateId: t1Id, name: 'Upper Body Push', daysAgo: 2, exercises: [
      { name: 'Bench Press', sets: [{ w: 80, r: 8 }, { w: 80, r: 7 }, { w: 75, r: 9 }, { w: 75, r: 8 }] },
      { name: 'Overhead Press', sets: [{ w: 40, r: 10 }, { w: 40, r: 9 }, { w: 40, r: 8 }] },
    ]},
    { templateId: t2Id, name: 'Lower Body', daysAgo: 1, exercises: [
      { name: 'Squat', sets: [{ w: 100, r: 6 }, { w: 100, r: 5 }, { w: 90, r: 8 }, { w: 90, r: 7 }] },
      { name: 'Romanian Deadlift', sets: [{ w: 80, r: 10 }, { w: 80, r: 9 }, { w: 80, r: 8 }] },
    ]},
  ];

  for (const sess of sampleSessions) {
    const started = now - sess.daysAgo * DAY + 10 * 3600_000;
    const ended = started + 50 * 60_000;
    const logUuid = newUuid();
    const log = await tx.runAsync(
      `INSERT INTO workout_logs (template_id, name, started_at, ended_at, duration_seconds, total_volume, unit, notes, uuid, created_at, updated_at)
       VALUES (?, ?, ?, ?, 3000, 0, 'metric', '', ?, ?, ?)`,
      sess.templateId, sess.name, started, ended, logUuid, started, now,
    );
    const logId = log.lastInsertRowId as number;

    let totalVolume = 0;
    for (const ex of sess.exercises) {
      const exId = await findId(ex.name);
      if (!exId) continue;
      for (let i = 0; i < ex.sets.length; i++) {
        const s = ex.sets[i];
        totalVolume += s.w * s.r;
        await tx.runAsync(
          `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, rest_seconds, uuid, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, 90, ?, ?, ?)`,
          logId, exId, i, s.w, s.r, newUuid(), started + i * 120_000, now,
        );
      }
    }
    await tx.runAsync('UPDATE workout_logs SET total_volume = ? WHERE id = ?', totalVolume, logId);
  }

  const profileUuid = newUuid();
  await tx.runAsync(
    `INSERT OR REPLACE INTO user_profile (id, name, goal, bodyweight, unit, experience_level, onboarding_completed, uuid, updated_at)
     VALUES (1, 'Chris', 'build_muscle', 85, 'metric', 'intermediate', 1, ?, ?)`,
    profileUuid, now,
  );

  return { templateIds: [t1Id, t2Id] };
}
