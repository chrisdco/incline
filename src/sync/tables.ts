import type { SyncTable } from './types';

/** Parent-before-child push order. Profiles last so placeholders cannot clobber a named cloud row mid-batch. */
export const PUSH_ORDER: SyncTable[] = [
  'user_exercises',
  'user_templates',
  'user_template_exercises',
  'user_programs',
  'user_program_workouts',
  'workout_logs',
  'set_entries',
  'workout_photos',
  'bodyweight_entries',
  'body_measurements',
  'user_active_program',
  'user_preferences',
  'profiles',
];

export const PULL_TABLES: { table: SyncTable; cloud: string; idCol: string }[] = [
  { table: 'profiles', cloud: 'profiles', idCol: 'user_id' },
  { table: 'user_exercises', cloud: 'user_exercises', idCol: 'id' },
  { table: 'user_templates', cloud: 'user_templates', idCol: 'id' },
  { table: 'user_template_exercises', cloud: 'user_template_exercises', idCol: 'id' },
  { table: 'user_programs', cloud: 'user_programs', idCol: 'id' },
  { table: 'user_program_workouts', cloud: 'user_program_workouts', idCol: 'id' },
  { table: 'workout_logs', cloud: 'workout_logs', idCol: 'id' },
  { table: 'set_entries', cloud: 'set_entries', idCol: 'id' },
  { table: 'workout_photos', cloud: 'workout_photos', idCol: 'id' },
  { table: 'bodyweight_entries', cloud: 'bodyweight_entries', idCol: 'id' },
  { table: 'body_measurements', cloud: 'body_measurements', idCol: 'id' },
  { table: 'user_active_program', cloud: 'user_active_program', idCol: 'user_id' },
  { table: 'user_preferences', cloud: 'user_preferences', idCol: 'user_id' },
];

const KNOWN = new Set<string>(PUSH_ORDER);

export function isKnownSyncTable(name: string): name is SyncTable {
  return KNOWN.has(name);
}

/** Cloud table name, or null if this outbox row must not be acknowledged. */
export function cloudTableFor(tableName: string): string | null {
  if (!isKnownSyncTable(tableName)) return null;
  return tableName;
}
