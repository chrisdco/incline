import { View } from 'react-native';

import { FilterChips } from '@/components/common/chip';
import {
  EQUIPMENT_FILTER_OPTIONS,
  MUSCLE_FILTER_OPTIONS,
  PATTERN_FILTER_OPTIONS,
} from '@/lib/exercise-filters';
import type { Equipment, MovementPattern, MuscleGroup } from '@/db/types';

export interface ExerciseFilterValues {
  muscle: MuscleGroup | null;
  equipment: Equipment | null;
  pattern: MovementPattern | null;
}

/**
 * Shared muscle/equipment/pattern chip rows for the library and the
 * pick-exercise (add/replace) screens. One component so both surfaces offer
 * the same filters with the same labels — the query layer answers all three
 * from SQLite (see ExerciseFilters), so neither screen filters in JS.
 */
export function ExerciseFilterBar({
  value,
  onChange,
}: {
  value: ExerciseFilterValues;
  onChange: (next: ExerciseFilterValues) => void;
}) {
  return (
    <View className="gap-2">
      <FilterChips
        options={MUSCLE_FILTER_OPTIONS}
        value={value.muscle}
        onChange={(muscle) => onChange({ ...value, muscle })}
      />
      <FilterChips
        options={EQUIPMENT_FILTER_OPTIONS}
        value={value.equipment}
        onChange={(equipment) => onChange({ ...value, equipment })}
        allLabel="Any equipment"
      />
      <FilterChips
        options={PATTERN_FILTER_OPTIONS}
        value={value.pattern}
        onChange={(pattern) => onChange({ ...value, pattern })}
        allLabel="Any pattern"
      />
    </View>
  );
}

/** True when at least one facet is active (empty query can still filter). */
export function hasExerciseFilters(value: ExerciseFilterValues): boolean {
  return value.muscle !== null || value.equipment !== null || value.pattern !== null;
}
