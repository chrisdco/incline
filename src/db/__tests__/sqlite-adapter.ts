/**
 * Test double for expo-sqlite over better-sqlite3 (Node/vitest only).
 *
 * Lets integration tests run the REAL query modules (sessions, outbox, …)
 * against the REAL current schema (SCHEMA_STATEMENTS) by mocking
 * `@/db/client`. Also supports fault injection (`failOn`) to prove
 * transaction atomicity: a throw mid-transaction must roll everything back.
 */
import Database from 'better-sqlite3';

import { SCHEMA_STATEMENTS } from '../schema';

export interface TestDbHandle {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (
    sql: string,
    ...params: unknown[]
  ) => Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync: <T>(sql: string, ...params: unknown[]) => Promise<T | null>;
  getAllAsync: <T>(sql: string, ...params: unknown[]) => Promise<T[]>;
  withTransactionAsync: <T>(task: () => Promise<T>) => Promise<T>;
}

function normalize(params: unknown[]): unknown[] {
  // expo-sqlite tolerates undefined; better-sqlite3 throws — match expo.
  return params.map((p) => (p === undefined ? null : p));
}

export function createTestDatabase(opts?: { failOn?: RegExp }): {
  db: TestDbHandle;
  close: () => void;
} {
  const raw = new Database(':memory:');
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  for (const stmt of SCHEMA_STATEMENTS) raw.exec(stmt);

  const db: TestDbHandle = {
    execAsync: async (sql: string) => {
      if (opts?.failOn?.test(sql)) throw new Error(`injected fault: ${sql.slice(0, 80)}`);
      raw.exec(sql);
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      if (opts?.failOn?.test(sql)) throw new Error(`injected fault: ${sql.slice(0, 80)}`);
      const info = raw.prepare(sql).run(...normalize(params));
      // better-sqlite3 spells it lastInsertRowid (lowercase d).
      return { lastInsertRowId: Number(info.lastInsertRowid), changes: Number(info.changes) };
    },
    getFirstAsync: async <T>(sql: string, ...params: unknown[]): Promise<T | null> => {
      const row = raw.prepare(sql).get(...normalize(params)) as T | undefined;
      return row ?? null;
    },
    getAllAsync: async <T>(sql: string, ...params: unknown[]): Promise<T[]> => {
      return raw.prepare(sql).all(...normalize(params)) as T[];
    },
    withTransactionAsync: async <T>(task: () => Promise<T>): Promise<T> => {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const result = await task();
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          raw.exec('ROLLBACK');
        } catch {
          // Already rolled back / no transaction — rethrow the original.
        }
        throw err;
      }
    },
  };
  return { db, close: () => raw.close() };
}
