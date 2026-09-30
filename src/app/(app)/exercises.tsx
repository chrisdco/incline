import { useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search as SearchIcon } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Caption } from '@/components/common/text';
import { SearchBar } from '@/components/common/search-bar';
import { FilterChips } from '@/components/common/chip';
import { EmptyState } from '@/components/common/states';
import { ListSkeleton } from '@/components/common/skeleton';
import { ExerciseListItem } from '@/components/exercise/exercise-list-item';
import { useSearchExercises } from '@/hooks/use-data';
import { useDebounce } from '@/hooks/use-debounce';
import { SCREEN_CONTENT, SCREEN_HEADER } from '@/lib/layout';
import {
  EQUIPMENT_FILTER_OPTIONS,
  MUSCLE_FILTER_OPTIONS,
  PATTERN_FILTER_OPTIONS,
} from '@/lib/exercise-filters';
import type { Equipment, MovementPattern, MuscleGroup } from '@/db/types';

export default function ExercisesScreen() {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [pattern, setPattern] = useState<MovementPattern | null>(null);
  const debouncedQuery = useDebounce(query);

  const filters = muscle || equipment || pattern
    ? { muscle: muscle ?? undefined, equipment: equipment ?? undefined, pattern: pattern ?? undefined }
    : undefined;
  const exercises = useSearchExercises(debouncedQuery, filters);
  const filtering = muscle !== null || equipment !== null || pattern !== null;

  const clearAll = () => {
    setQuery('');
    setMuscle(null);
    setEquipment(null);
    setPattern(null);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className={SCREEN_HEADER}>
        <Caption>
          {exercises.data?.length ?? 0} exercises in library{filtering ? ' · filtered' : ''}
        </Caption>
      </View>

      <FlashList
        data={exercises.data ?? []}
        renderItem={({ item }) => <ExerciseListItem exercise={item.exercise} />}
        keyExtractor={(item) => String(item.exercise.id)}
        contentContainerStyle={SCREEN_CONTENT}
        ItemSeparatorComponent={() => <View className="h-2" />}
        ListHeaderComponent={
          <View className="mb-3 gap-3">
            <SearchBar value={query} onChangeText={setQuery} placeholder="Search exercises..." />
            <View className="gap-2">
              <FilterChips options={MUSCLE_FILTER_OPTIONS} value={muscle} onChange={setMuscle} />
              <FilterChips options={EQUIPMENT_FILTER_OPTIONS} value={equipment} onChange={setEquipment} allLabel="Any equipment" />
              <FilterChips options={PATTERN_FILTER_OPTIONS} value={pattern} onChange={setPattern} allLabel="Any pattern" />
            </View>
          </View>
        }
        ListEmptyComponent={
          exercises.loading ? (
            <ListSkeleton count={4} />
          ) : (
            <EmptyState
              icon={<Icon icon={SearchIcon} size={28} color="muted-foreground" />}
              title="No exercises found"
              description="Try a different search or filter."
              actionLabel="Clear"
              onAction={clearAll}
            />
          )
        }
      />
    </SafeAreaView>
  );
}
