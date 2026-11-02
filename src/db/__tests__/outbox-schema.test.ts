/**
 * sync_outbox.next_attempt_at (#139) arrives through ensureSyncSchema on
 * existing installs: additive, idempotent, and pending rows stay due.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';

import { ensureSyncSchema } from '../ensure-sync-schema';
import { SCHEMA_STATEMENTS } from '../schema';
import { createTestDatabase } from './sqlite-adapter';

describe('sync_outbox backoff column', () => {
  it('is added to an outbox created before it existed, keeping queued rows due', async () => {
    const old = SCHEMA_STATEMENTS.map((s) => s.replace(/,\s*next_attempt_at INTEGER NOT NULL DEFAULT 0/, ''));
    expect(old.join('\n')).not.toMatch(/next_attempt_at/);
    const t = createTestDatabase({
      ddl: [
        ...old,
        `INSERT INTO sync_outbox (table_name, row_uuid, op, payload, created_at, attempts)
         VALUES ('set_entries', 'set-1', 'upsert', '{}', 1, 3)`,
      ],
    });

    await ensureSyncSchema(t.db as unknown as SQLiteDatabase);
    await ensureSyncSchema(t.db as unknown as SQLiteDatabase);

    const row = await t.db.getFirstAsync<{ attempts: number; next_attempt_at: number }>(
      'SELECT attempts, next_attempt_at FROM sync_outbox',
    );
    expect(row).toEqual({ attempts: 3, next_attempt_at: 0 });
    t.close();
  });
});
