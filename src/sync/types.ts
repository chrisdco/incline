/** Cloud / outbox table names for syncable entities. */
export type SyncTable =
  | 'profiles'
  | 'user_exercises'
  | 'user_templates'
  | 'user_template_exercises'
  | 'workout_logs'
  | 'set_entries'
  | 'bodyweight_entries'
  | 'body_measurements'
  | 'user_programs'
  | 'user_program_workouts'
  | 'user_active_program'
  | 'user_preferences'
  | 'workout_photos';

export type SyncOp = 'upsert' | 'delete';

export type ExerciseRef =
  | { ref: 'catalog'; externalId: string }
  | { ref: 'custom'; exerciseUuid: string }
  | { ref: 'unknown' };

export type TemplateRef =
  | { ref: 'custom'; templateUuid: string }
  | { ref: 'seed'; seedTemplateId: number }
  | { ref: 'unknown' };

export interface SyncStatus {
  lastPullAt: number | null;
  lastPushAt: number | null;
  cursor: number;
  status: 'idle' | 'syncing' | 'error';
  lastError: string | null;
}
