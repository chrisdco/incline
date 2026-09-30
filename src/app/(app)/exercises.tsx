import { useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search as SearchIcon } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Caption } from '@/components/common/text';
import { SearchBar } from '@/components/common/search-bar';
import {
  ExerciseFilterBar,
  hasExerciseFilters,
  type ExerciseFilterValues,
} from '@/components/exercise/exercise-filter-bar';
import { EmptyState } from '@/components/common/states';
import { ListSkeleton } from '@/components/common/skeleton';
import { ExerciseListItem } from '@/components/exercise/exercise-list-item';
import { useSearchExercises } from '@/hooks/use-data';
import { useDebounce } from '@/hooks/use-debounce';
import { SCREEN_CONTENT, SCREEN_HEADER } from '@/lib/layout';

export default function ExercisesScreen() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ExerciseFilterValues>({ muscle: null, equipment: null, pattern: null });
  const debouncedQuery = useDebounce(query);

  const active = hasExerciseFilters(filters);
  const exercises = useSearchExercises(
    debouncedQuery,
    active
      ? {
          muscle: filters.muscle ?? undefined,
          equipment: filters.equipment ?? undefined,
          pattern: filters.pattern ?? undefined,
        }
      : undefined,
  );
  const filtering = active;

  const clearAll = () => {
    setQuery('');
    setFilters({ muscle: null, equipment: null, pattern: null });
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
            <ExerciseFilterBar value={filters} onChange={setFilters} />
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
