import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { DB_NAME } from '@/constants/config';
import { emitTablesChanged } from './changes';
import { ensureSyncSchema } from './ensure-sync-schema';
import { ensureProgramBuilderSchema } from './ensure-program-schema';
import { ensureSyncUuids } from './ensure-uuids';
import { LATEST_SCHEMA_VERSION, runMigrations } from './migrations';
import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from './schema';
import { seedDatabase } from './seed';
import { seedFromSupabase } from './seed-supabase';
let _db: SQLite.SQLiteDatabase | null = null;
let _ready: Promise<SQLite.SQLiteDatabase> | null = null;
let _writer: Promise<SQLite.SQLiteDatabase> | null = null;
let _changeSub: { remove(): void } | null = null;

/** Both connections wait on each other's write lock instead of failing fast. */
const BUSY_TIMEOUT_MS = 5000;

if (SCHEMA_VERSION !== LATEST_SCHEMA_VERSION) {
  console.warn(
    `[db] SCHEMA_VERSION (${SCHEMA_VERSION}) != LATEST_SCHEMA_VERSION (${LATEST_SCHEMA_VERSION})`,
  );
}

/**
 * Open (and lazily migrate + seed) the database. Returns a cached connection,
 * so calling this from every query is cheap after the first run.
 *
 * The active workout is the single source of truth for in-progress sessions and
 * lives in `workout_logs` (rows with `ended_at IS NULL`). This makes a session
 * crash/resume safe without holding the whole workout in memory.
 */
export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (_ready) return _ready;
  _ready = (async () => {
    try {
      const database = await SQLite.openDatabaseAsync(DB_NAME, { enableChangeListener: true });
      await database.execAsync('PRAGMA journal_mode = WAL');
      await database.execAsync('PRAGMA foreign_keys = ON');
      await database.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);

      for (const stmt of SCHEMA_STATEMENTS) {
        await database.execAsync(stmt);
      }

      const meta = await database.getFirstAsync<{ value: string }>(
        "SELECT value FROM schema_meta WHERE key = 'version'",
      );
      const current = meta ? Number(meta.value) : 0;

      if (current === 0) {
        // Fresh install: CREATE IF NOT EXISTS already applied the latest schema.
        await database.runAsync(
          "INSERT INTO schema_meta (key, value) VALUES ('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          String(SCHEMA_VERSION),
        );
      } else if (current < SCHEMA_VERSION) {
        await runMigrations(database, current);
      }

      // Always repair sync columns/indexes (handles CREATE IF NOT EXISTS upgrades).
      await ensureSyncSchema(database);
      await ensureProgramBuilderSchema(database);

      const seeded = await database.getFirstAsync<{ value: string }>(
        "SELECT value FROM schema_meta WHERE key = 'seeded'",
      );
      if (!seeded) {
        await seedDatabase(database);
        await database.runAsync(
          "INSERT INTO schema_meta (key, value) VALUES ('seeded', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        );
      }

      await ensureSyncUuids(database);

      // Once per device: stored loads become canonical kg/cm (§15). Lazy
      // import keeps the query modules out of this module's load cycle.
      const { canonicalizeStoredUnits } = await import('./canonical-units');
      const units = await canonicalizeStoredUnits(database);
      if (units.ran && units.sets + units.bodyweight + units.measurements > 0) {
        console.info('[db] canonical units backfill', units);
      }

      // Ensure version meta matches after repair (e.g. stamped early without columns).
      await database.runAsync(
        "INSERT INTO schema_meta (key, value) VALUES ('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        String(SCHEMA_VERSION),
      );

      _db = database;
      _changeSub ??= SQLite.addDatabaseChangeListener((e) => emitTablesChanged([e.tableName]));

      // Catalog sync is offline-friendly and idempotent — do not block DB readiness.
      void seedFromSupabase(database).catch((err) => {
        console.warn('[db] Supabase exercise seed failed', err);
      });

      return database;
    } catch (err) {
      // Allow a later openDatabase() call to retry after a failed boot.
      _ready = null;
      throw err;
    }
  })();
  return _ready;
}

/**
 * The connection `mutate()` runs its transactions on. A dedicated connection
 * (not `withExclusiveTransactionAsync`, which opens one per call and BEGINs
 * before per-connection pragmas like foreign_keys can be set) so queries on
 * the shared read connection can never interleave into a write transaction.
 * WAL lets reads on the shared connection proceed while it holds the lock.
 * Web has no second connection; `mutate()`'s queue still serialises writers.
 */
export async function openWriterDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_writer) return _writer;
  _writer = (async () => {
    const main = await openDatabase();
    if (Platform.OS === 'web') return main;
    const writer = await SQLite.openDatabaseAsync(DB_NAME, {
      useNewConnection: true,
      enableChangeListener: true,
    });
    await writer.execAsync('PRAGMA foreign_keys = ON');
    await writer.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    return writer;
  })().catch((err: unknown) => {
    _writer = null;
    throw err;
  });
  return _writer;
}

/** True once openDatabase() has resolved at least once. */
export function isDatabaseReady(): boolean {
  return _db !== null;
}

/** Test helper: clear the cached connection (does not delete the file). */
export function __resetDatabaseCacheForTests(): void {
  _db = null;
  _ready = null;
  _writer = null;
}
