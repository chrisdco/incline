import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';

import { Caption } from '@/components/common/text';
import { SegmentedControl } from '@/components/common/segmented-control';
import { EmptyState, ErrorState } from '@/components/common/states';
import { ListSkeleton } from '@/components/common/skeleton';
import { Input } from '@/components/ui/input';
import { PRCard } from '@/components/progress/pr-card';
import { useAllTimeRecords } from '@/hooks/use-data';
import { SCREEN_CONTENT } from '@/lib/layout';
import { useSettings } from '@/store/settings-store';
import type { PR } from '@/db/types';

type Sort = 'recent' | 'strongest' | 'name';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'strongest', label: 'Strongest' },
  { value: 'name', label: 'A–Z' },
];

const COMPARE: Record<Sort, (a: PR, b: PR) => number> = {
  recent: (a, b) => b.achievedAt - a.achievedAt,
  strongest: (a, b) => b.estimated1RM - a.estimated1RM,
  name: (a, b) => a.exerciseName.localeCompare(b.exerciseName),
};

function sortRecords(prs: readonly PR[], sort: Sort, query: string): PR[] {
  const q = query.trim().toLowerCase();
  return prs.filter((p) => !q || p.exerciseName.toLowerCase().includes(q)).sort(COMPARE[sort]);
}

/**
 * Every exercise's best lift, all time (Progress → Records → See all).
 * Progress shows the latest few; this is the full list, searchable, with
 * a row per exercise that opens its history.
 */
export default function RecordsScreen() {
  const unit = useSettings((s) => s.unit);
  const { data, loading, error, refetch } = useAllTimeRecords();
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const rows = useMemo(() => sortRecords(data ?? [], sort, query), [data, sort, query]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlashList
        data={rows}
        keyExtractor={(pr) => String(pr.exerciseId)}
        renderItem={({ item }) => <PRCard pr={item} unit={unit} />}
        ItemSeparatorComponent={() => <View className="h-px bg-hairline" />}
        contentContainerStyle={SCREEN_CONTENT}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="mb-2 gap-3">
            <Caption>{headerLine(data?.length ?? 0)}</Caption>
            <Input value={query} onChangeText={setQuery} placeholder="Search exercises" autoCorrect={false} />
            <SegmentedControl value={sort} onChange={setSort} values={SORTS} />
          </View>
        }
        ListEmptyComponent={<RecordsEmpty loading={loading} error={!!error} onRetry={refetch} searching={!!query.trim()} />}
      />
    </SafeAreaView>
  );
}

function headerLine(count: number): string {
  if (!count) return 'Your best lift on every exercise.';
  return `Your best lift on ${count} exercise${count === 1 ? '' : 's'}. Tap one for its history.`;
}

function RecordsEmpty({ loading, error, onRetry, searching }: { loading: boolean; error: boolean; onRetry: () => void; searching: boolean }) {
  if (loading) return <ListSkeleton count={6} />;
  if (error) return <ErrorState onRetry={onRetry} />;
  if (searching) return <EmptyState title="No matching exercises" description="Try another name." />;
  return <EmptyState title="No records yet" description="Log a few workouts to see your PRs." />;
}
