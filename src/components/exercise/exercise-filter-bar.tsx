import { useState } from 'react';
import { View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';

import { cn } from '@/lib/cn';
import { Text } from '@/components/common/text';
import { Icon } from '@/components/common/icon';
import { Tappable } from '@/components/ui/tappable';
import { FilterChips, type FilterOption } from '@/components/common/chip';
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

type Facet = keyof ExerciseFilterValues;

const FACETS: { key: Facet; label: string; allLabel: string; options: FilterOption<string>[] }[] = [
  { key: 'muscle', label: 'Muscle', allLabel: 'Any muscle', options: MUSCLE_FILTER_OPTIONS },
  { key: 'equipment', label: 'Equipment', allLabel: 'Any equipment', options: EQUIPMENT_FILTER_OPTIONS },
  { key: 'pattern', label: 'Pattern', allLabel: 'Any pattern', options: PATTERN_FILTER_OPTIONS },
];

/**
 * Shared muscle/equipment/pattern filters for the library and the
 * pick-exercise (add/replace) screens. One component so both surfaces offer
 * the same filters with the same labels — the query layer answers all three
 * from SQLite (see ExerciseFilters), so neither screen filters in JS.
 *
 * Reference anatomy (Hevy "All Equipment / All Muscles", Strong "Any Body
 * Part / Any Category"): one row of facet buttons under search, the list
 * starts right after. Tapping a facet opens its options as one chip row
 * inline (no nested sheet — the picker is already a sheet). An active facet
 * shows its value, inverse-filled like a selected chip.
 */
export function ExerciseFilterBar({
  value,
  onChange,
}: {
  value: ExerciseFilterValues;
  onChange: (next: ExerciseFilterValues) => void;
}) {
  const [open, setOpen] = useState<Facet | null>(null);
  const openFacet = FACETS.find((f) => f.key === open);

  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        {FACETS.map((facet) => {
          const isOpen = open === facet.key;
          const selectedLabel = facet.options.find((o) => o.value === value[facet.key])?.label;
          return (
            <Tappable
              key={facet.key}
              onPress={() => setOpen(isOpen ? null : facet.key)}
              pressedOpacity={0.55}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen, selected: selectedLabel != null }}
              accessibilityLabel={`${facet.label} filter${selectedLabel ? `: ${selectedLabel}` : ''}`}
              style={{ flex: 1 }}
              className={cn(
                'h-9 flex-row items-center justify-center gap-1 rounded-xl px-2',
                selectedLabel ? 'bg-foreground' : isOpen ? 'bg-surface3' : 'bg-surface2',
              )}>
              <Text
                numberOfLines={1}
                className={cn('shrink text-sm font-medium', selectedLabel ? 'text-background' : 'text-foreground-secondary')}>
                {selectedLabel ?? facet.label}
              </Text>
              {selectedLabel ? null : (
                <Icon icon={isOpen ? ChevronUp : ChevronDown} size={14} color="muted-foreground" />
              )}
            </Tappable>
          );
        })}
      </View>
      {openFacet ? (
        <FilterChips
          options={openFacet.options}
          value={value[openFacet.key]}
          allLabel={openFacet.allLabel}
          onChange={(next) => {
            onChange({ ...value, [openFacet.key]: next } as ExerciseFilterValues);
            setOpen(null);
          }}
        />
      ) : null}
    </View>
  );
}

/** True when at least one facet is active (empty query can still filter). */
export function hasExerciseFilters(value: ExerciseFilterValues): boolean {
  return value.muscle !== null || value.equipment !== null || value.pattern !== null;
}
