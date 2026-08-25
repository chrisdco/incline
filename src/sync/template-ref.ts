import { openDatabase } from '@/db/client';
import type { TemplateRef } from './types';

export type { TemplateRef };

/** Custom template UUID, or stable seed integer id — never a seed row's random UUID. */
export async function templateRefForId(templateId: number): Promise<TemplateRef> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ is_custom: number; uuid: string | null }>(
    'SELECT is_custom, uuid FROM workout_templates WHERE id = ?',
    templateId,
  );
  if (!row) return { ref: 'unknown' };
  if (row.is_custom) {
    if (!row.uuid) return { ref: 'unknown' };
    return { ref: 'custom', templateUuid: row.uuid };
  }
  return { ref: 'seed', seedTemplateId: templateId };
}

export async function resolveTemplateRef(ref: TemplateRef): Promise<number | null> {
  const db = await openDatabase();
  if (ref.ref === 'custom') {
    const row = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM workout_templates WHERE uuid = ? AND is_custom = 1 AND deleted_at IS NULL',
      ref.templateUuid,
    );
    return row?.id ?? null;
  }
  if (ref.ref === 'seed') {
    const row = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM workout_templates WHERE id = ? AND is_custom = 0 AND deleted_at IS NULL',
      ref.seedTemplateId,
    );
    return row?.id ?? null;
  }
  return null;
}
