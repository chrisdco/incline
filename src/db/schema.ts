/**
 * Database schema. All statements are idempotent (IF NOT EXISTS) so they are
 * safe to re-run. Searchable fields (aliases, secondary muscles, instructions)
 * are normalized into child tables so they can be indexed and queried directly
 * rather than parsing JSON at query time.
 *
 * Incremental schema changes live in `src/db/migrations/` and are applied by
 * `runMigrations` in `client.ts`. Keep SCHEMA_VERSION in sync with the latest
 * migration version.
 */
export const SCHEMA_VERSION = 16;

export const SCHEMA_STATEMENTS: string[] = [
  // ---- exercises (catalog + custom) ----
  `CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    primary_muscle TEXT NOT NULL,
    movement_pattern TEXT,
    equipment TEXT NOT NULL,
    category TEXT NOT NULL,
    is_compound INTEGER NOT NULL DEFAULT 0,
    is_custom INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'seed',
    external_id TEXT,
    difficulty TEXT,
    default_rest_seconds INTEGER NOT NULL DEFAULT 90,
    tips TEXT,
    uuid TEXT,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS exercise_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    alias TEXT NOT NULL,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS exercise_secondary_muscles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    muscle TEXT NOT NULL,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS exercise_instructions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    step INTEGER NOT NULL,
    text TEXT NOT NULL,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
  )`,

  `CREATE TABLE IF NOT EXISTS exercise_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_exercise_images_exercise ON exercise_images(exercise_id, sort_order)`,

  // ---- templates ----
  `CREATE TABLE IF NOT EXISTS workout_templates (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'strength',
    difficulty TEXT NOT NULL DEFAULT 'intermediate',
    estimated_minutes INTEGER NOT NULL DEFAULT 45,
    is_custom INTEGER NOT NULL DEFAULT 0,
    uuid TEXT,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS template_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL,
    target_sets INTEGER NOT NULL,
    target_reps_min INTEGER NOT NULL,
    target_reps_max INTEGER NOT NULL,
    rest_seconds INTEGER NOT NULL DEFAULT 90,
    notes TEXT NOT NULL DEFAULT '',
    superset_group INTEGER,
    uuid TEXT,
    updated_at INTEGER,
    deleted_at INTEGER,
    FOREIGN KEY (template_id) REFERENCES workout_templates(id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
  )`,

  // ---- programs ----
  `CREATE TABLE IF NOT EXISTS programs (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    weeks INTEGER NOT NULL DEFAULT 4,
    is_custom INTEGER NOT NULL DEFAULT 0,
    uuid TEXT,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS program_workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id INTEGER NOT NULL,
    template_id INTEGER NOT NULL,
    week INTEGER NOT NULL,
    day INTEGER NOT NULL,
    sort_order INTEGER NOT NULL,
    uuid TEXT,
    deleted_at INTEGER,
    updated_at INTEGER,
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES workout_templates(id) ON DELETE CASCADE
  )`,

  // ---- workout logs (user data) ----
  `CREATE TABLE IF NOT EXISTS workout_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER,
    name TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    total_volume REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'metric',
    notes TEXT NOT NULL DEFAULT '',
    uuid TEXT,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS workout_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_log_id INTEGER NOT NULL,
    uri TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    uuid TEXT,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0,
    storage_path TEXT,
    content_type TEXT NOT NULL DEFAULT 'image/jpeg',
    byte_size INTEGER,
    checksum TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS photo_blob_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_uuid TEXT NOT NULL,
    op TEXT NOT NULL,
    storage_path TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS set_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_log_id INTEGER NOT NULL,
    exercise_id INTEGER NOT NULL,
    set_index INTEGER NOT NULL,
    weight REAL NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    rest_seconds INTEGER,
    superset_group INTEGER,
    set_type TEXT NOT NULL DEFAULT 'working',
    rpe INTEGER,
    uuid TEXT,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`,

  // ---- profile ----
  `CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    goal TEXT NOT NULL DEFAULT 'build_muscle',
    bodyweight REAL,
    unit TEXT NOT NULL DEFAULT 'metric',
    experience_level TEXT NOT NULL DEFAULT 'intermediate',
    onboarding_completed INTEGER NOT NULL DEFAULT 0,
    avatar_url TEXT,
    uuid TEXT,
    deleted_at INTEGER,
    updated_at INTEGER NOT NULL
  )`,

  // ---- bodyweight tracking ----
  `CREATE TABLE IF NOT EXISTS bodyweight_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    weight REAL NOT NULL,
    unit TEXT NOT NULL DEFAULT 'kg',
    recorded_at INTEGER NOT NULL,
    uuid TEXT,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bodyweight_recorded ON bodyweight_entries(recorded_at DESC)`,

  // ---- body part measurements (arms, waist, …) ----
  `CREATE TABLE IF NOT EXISTS body_measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    recorded_at INTEGER NOT NULL,
    uuid TEXT,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_body_measurements_metric ON body_measurements(metric, recorded_at DESC)`,

  // ---- sync outbox ----
  `CREATE TABLE IF NOT EXISTS sync_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    row_uuid TEXT NOT NULL,
    op TEXT NOT NULL,
    payload TEXT,
    created_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_outbox_order ON sync_outbox(id)`,

  // ---- key/value (Zustand persist + flags) ----
  `CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  // ---- indexes (hot query paths) ----
  `CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name)`,
  `CREATE INDEX IF NOT EXISTS idx_exercises_primary_muscle ON exercises(primary_muscle)`,
  `CREATE INDEX IF NOT EXISTS idx_exercises_movement ON exercises(movement_pattern)`,
  `CREATE INDEX IF NOT EXISTS idx_exercises_equipment ON exercises(equipment)`,
  // UUID unique indexes are created in migration 007 / ensureSyncSchema after columns exist.
  // Creating them here breaks upgrades: CREATE TABLE IF NOT EXISTS leaves old tables without uuid.
  `CREATE INDEX IF NOT EXISTS idx_aliases_alias ON exercise_aliases(alias)`,
  `CREATE INDEX IF NOT EXISTS idx_aliases_exercise ON exercise_aliases(exercise_id)`,
  `CREATE INDEX IF NOT EXISTS idx_secondary_exercise ON exercise_secondary_muscles(exercise_id)`,
  `CREATE INDEX IF NOT EXISTS idx_instructions_exercise ON exercise_instructions(exercise_id)`,
  `CREATE INDEX IF NOT EXISTS idx_template_exercises_template ON template_exercises(template_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_program_workouts_program ON program_workouts(program_id, week, day, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_workout_logs_started ON workout_logs(started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_workout_logs_template ON workout_logs(template_id)`,
  `CREATE INDEX IF NOT EXISTS idx_workout_photos_log ON workout_photos(workout_log_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_set_entries_log ON set_entries(workout_log_id, set_index)`,
  `CREATE INDEX IF NOT EXISTS idx_set_entries_exercise ON set_entries(exercise_id, created_at DESC)`,
  // Program uuid unique indexes: migration 008 / ensureProgramBuilderSchema (not here —
  // CREATE IF NOT EXISTS upgrades keep old programs tables without uuid).
];
