import type { FilterOption } from '@/components/common/chip';
import { EQUIPMENT_LABELS, MOVEMENT_LABELS, MUSCLE_LABELS } from '@/lib/labels';
import type { Equipment, MovementPattern, MuscleGroup } from '@/db/types';
import type { TemplateSummary } from '@/db/queries';

/**
 * Shared browse filters for the exercise library. Options mirror the
 * SQLite-backed ExerciseFilters exactly, so chips never offer a filter the
 * query layer cannot answer.
 *
 * Scale note (prod path): routine search/sort below runs in JS because
 * routine lists are tiny (dozens). If that ever reaches the hundreds, move
 * it into SQL (LIKE + ORDER BY over workout_templates) the same way
 * exercise search already works — do not grow these helpers.
 */

export const ALL_MUSCLES: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'forearms',
  'traps',
  'full_body',
];

export const ALL_EQUIPMENT: Equipment[] = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'kettlebell',
  'bodyweight',
  'band',
  'other',
];

export const ALL_PATTERNS: MovementPattern[] = [
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'squat_hinge',
  'isolation',
  'carry',
  'core',
];

export const MUSCLE_FILTER_OPTIONS: FilterOption<MuscleGroup>[] = ALL_MUSCLES.map((m) => ({
  value: m,
  label: MUSCLE_LABELS[m],
}));

export const EQUIPMENT_FILTER_OPTIONS: FilterOption<Equipment>[] = ALL_EQUIPMENT.map((e) => ({
  value: e,
  label: EQUIPMENT_LABELS[e],
}));

export const PATTERN_FILTER_OPTIONS: FilterOption<MovementPattern>[] = ALL_PATTERNS.map((p) => ({
  value: p,
  label: MOVEMENT_LABELS[p],
}));

export type RoutineSort = 'recent' | 'name';

/** In-memory routine search across name + description + exercise names. */
export function filterRoutineSummaries(items: TemplateSummary[], query: string): TemplateSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const hay = [item.template.name, item.template.description ?? '', ...(item.exerciseNames ?? [])]
      .join(' ')
      .toLowerCase();
    return q.split(/\s+/).every((token) => hay.includes(token));
  });
}

/** In-memory routine sort. `recent` = last modified (updated_at bumps on any edit). */
export function sortRoutineSummaries(items: TemplateSummary[], sort: RoutineSort): TemplateSummary[] {
  const next = [...items];
  if (sort === 'name') {
    next.sort((a, b) => a.template.name.localeCompare(b.template.name));
  } else {
    next.sort((a, b) => (b.template.updatedAt ?? 0) - (a.template.updatedAt ?? 0));
  }
  return next;
}
