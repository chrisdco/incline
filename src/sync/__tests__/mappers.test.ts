import { describe, expect, it } from 'vitest';

import { asSetType, buildCloudUpsertRow } from '../mappers';
import { cloudTableFor, isKnownSyncTable, PUSH_ORDER } from '../tables';

describe('sync mappers', () => {
  it('preserves set_type, rpe, and superset_group on set push', () => {
    const row = buildCloudUpsertRow(
      'set_entries',
      'set-uuid',
      'user-1',
      {
        workout_log_uuid: 'log-uuid',
        exercise_ref: { ref: 'catalog', externalId: 'barbell-bench-press' },
        set_index: 1,
        weight: 100,
        reps: 8,
        completed: 1,
        rest_seconds: 90,
        superset_group: 2,
        set_type: 'warmup',
        rpe: 7,
        created_at: 1_000,
      },
      2_000,
      null,
    );

    expect(row.set_type).toBe('warmup');
    expect(row.rpe).toBe(7);
    expect(row.superset_group).toBe(2);
    expect(row.workout_log_id).toBe('log-uuid');
    expect(row.ref_type).toBe('catalog');
    expect(row.catalog_external_id).toBe('barbell-bench-press');
  });

  it('defaults unknown set_type to working', () => {
    expect(asSetType(undefined)).toBe('working');
    expect(asSetType('working')).toBe('working');
    expect(asSetType('warmup')).toBe('warmup');
    const row = buildCloudUpsertRow(
      'set_entries',
      'set-uuid',
      'user-1',
      { workout_log_uuid: 'log-uuid' },
      1,
      null,
    );
    expect(row.set_type).toBe('working');
    expect(row.rpe).toBeNull();
    expect(row.superset_group).toBeNull();
  });

  it('preserves template-exercise superset_group', () => {
    const row = buildCloudUpsertRow(
      'user_template_exercises',
      'te-uuid',
      'user-1',
      {
        template_uuid: 'tpl-uuid',
        exercise_ref: { ref: 'custom', exerciseUuid: 'ex-uuid' },
        sort_order: 0,
        target_sets: 3,
        target_reps_min: 8,
        target_reps_max: 12,
        rest_seconds: 90,
        notes: '',
        superset_group: 1,
      },
      1,
      null,
    );
    expect(row.superset_group).toBe(1);
    expect(row.template_id).toBe('tpl-uuid');
    expect(row.user_exercise_id).toBe('ex-uuid');
  });

  it('maps circumference rows', () => {
    const row = buildCloudUpsertRow(
      'body_measurements',
      'm-uuid',
      'user-1',
      {
        metric: 'waist',
        value: 82.5,
        unit: 'cm',
        recorded_at: 1_000,
        created_at: 1_000,
      },
      1_000,
      null,
    );
    expect(row.metric).toBe('waist');
    expect(row.value).toBe(82.5);
    expect(row.unit).toBe('cm');
    expect(row.recorded_at).toBe(new Date(1_000).toISOString());
  });

  it('maps custom program slots with seed or custom template refs', () => {
    const custom = buildCloudUpsertRow(
      'user_program_workouts',
      'slot-uuid',
      'user-1',
      {
        program_uuid: 'prog-uuid',
        template_ref: { ref: 'custom', templateUuid: 'tpl-uuid' },
        week: 2,
        day: 3,
        sort_order: 0,
      },
      1,
      null,
    );
    expect(custom.program_id).toBe('prog-uuid');
    expect(custom.ref_type).toBe('custom');
    expect(custom.user_template_id).toBe('tpl-uuid');
    expect(custom.seed_template_id).toBeNull();

    const seed = buildCloudUpsertRow(
      'user_program_workouts',
      'slot-uuid',
      'user-1',
      {
        program_uuid: 'prog-uuid',
        template_ref: { ref: 'seed', seedTemplateId: 3 },
        week: 1,
        day: 1,
        sort_order: 0,
      },
      1,
      null,
    );
    expect(seed.ref_type).toBe('seed');
    expect(seed.seed_template_id).toBe(3);
    expect(seed.user_template_id).toBeNull();
  });

  it('maps photo metadata without a uri', () => {
    const row = buildCloudUpsertRow(
      'workout_photos',
      'photo-uuid',
      'user-1',
      {
        workout_log_uuid: 'log-uuid',
        storage_path: 'user-1/log-uuid/photo-uuid.jpg',
        content_type: 'image/jpeg',
        byte_size: 12000,
        checksum: 'abc',
        sort_order: 0,
        created_at: 1,
      },
      1,
      null,
    );
    expect(row.workout_log_id).toBe('log-uuid');
    expect(row.storage_path).toBe('user-1/log-uuid/photo-uuid.jpg');
    expect(row).not.toHaveProperty('uri');
  });
});

describe('sync tables', () => {
  it('does not treat unknown outbox tables as ack-able', () => {
    expect(cloudTableFor('not_a_real_table')).toBeNull();
    expect(isKnownSyncTable('set_entries')).toBe(true);
    expect(isKnownSyncTable('body_measurements')).toBe(true);
    expect(isKnownSyncTable('user_programs')).toBe(true);
    expect(PUSH_ORDER.indexOf('user_programs')).toBeGreaterThan(
      PUSH_ORDER.indexOf('user_templates'),
    );
    expect(PUSH_ORDER.indexOf('body_measurements')).toBeGreaterThan(
      PUSH_ORDER.indexOf('set_entries'),
    );
  });
});
