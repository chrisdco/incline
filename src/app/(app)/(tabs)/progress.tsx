import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { Camera, CalendarRange, ChevronRight, Dumbbell, TrendingUp } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Heading, Caption, Body } from '@/components/common/text';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatCard } from '@/components/common/stat-card';
import { SectionHeader } from '@/components/common/section-header';
import { EmptyState, ErrorState } from '@/components/common/states';
import { ListSkeleton } from '@/components/common/skeleton';
import { SegmentedControl } from '@/components/common/segmented-control';
import { VolumeChart } from '@/components/progress/volume-chart';
import { TrendChip } from '@/components/progress/trend-chip';
import { PRCard } from '@/components/progress/pr-card';
import { HistoryRow } from '@/components/progress/history-row';
import {
  HistoryFilters,
  HistoryExerciseFilterSheet,
  HistoryTemplateFilterSheet,
  historyRangeSinceMs,
  type HistoryFilterSelection,
} from '@/components/progress/history-filters';
import { usePeriodStats, useWorkoutLogs } from '@/hooks/use-data';
import { useSettings } from '@/store/settings-store';
import { formatMonthLabel, formatVolume, previousMonthStart } from '@/db/calc';
import { MUSCLE_LABELS } from '@/lib/labels';
import { SCREEN_CONTENT } from '@/lib/layout';
import { METRIC_ICONS } from '@/lib/metric-icons';
import type { ProgressRange } from '@/db/types';
import type { WorkoutLogFilters } from '@/db/queries';

const RANGES: { value: ProgressRange; label: string }[] = [
  { value: '1w', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '3m', label: '3M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
];

function weekLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'short' });
}

export default function ProgressScreen() {
  const router = useRouter();
  const { unit } = useSettings();
  const [range, setRange] = useState<ProgressRange>('30d');
  const [historyRange, setHistoryRange] = useState<ProgressRange>('all');
  const [historyExercise, setHistoryExercise] = useState<HistoryFilterSelection | null>(null);
  const [historyTemplate, setHistoryTemplate] = useState<HistoryFilterSelection | null>(null);
  const [exerciseSheetOpen, setExerciseSheetOpen] = useState(false);
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const { data: stats, loading, error, refetch } = usePeriodStats(range);

  const historyFilters = useMemo<WorkoutLogFilters>(() => {
    const filters: WorkoutLogFilters = {};
    const sinceMs = historyRangeSinceMs(historyRange);
    if (sinceMs != null) filters.sinceMs = sinceMs;
    if (historyExercise) filters.exerciseId = historyExercise.id;
    if (historyTemplate) filters.templateId = historyTemplate.id;
    return filters;
  }, [historyRange, historyExercise, historyTemplate]);

  const history = useWorkoutLogs(historyFilters);
  const historyFiltered =
    historyRange !== 'all' || historyExercise != null || historyTemplate != null;

  const clearHistoryFilters = () => {
    setHistoryRange('all');
    setHistoryExercise(null);
    setHistoryTemplate(null);
  };

  const volumeData = useMemo(() => {
    if (!stats) return [];
    if (range === '1y' || range === 'all') {
      return stats.monthlyVolume.map((w) => ({ label: monthLabel(w.month), value: w.volume }));
    }
    return stats.weeklyVolume.map((w) => ({ label: weekLabel(w.weekStart), value: w.volume }));
  }, [stats, range]);

  const topMuscle = useMemo(() => {
    const list = stats?.muscleDistribution ?? [];
    if (list.length === 0) return null;
    return [...list].sort((a, b) => b.sets - a.sets)[0];
  }, [stats]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <FlashList
        data={history.items}
        renderItem={({ item }) => <HistoryRow log={item} unit={unit} />}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={SCREEN_CONTENT}
        ItemSeparatorComponent={() => <View className="h-2" />}
        onEndReached={history.loadMore}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          <View className="mb-4 gap-5">
            <View className="mt-2">
              <Heading>Progress</Heading>
              <Caption className="mt-1">Your training history at a glance.</Caption>
            </View>

            <SegmentedControl value={range} onChange={setRange} values={RANGES} />

            {loading && !stats ? (
              <View className="flex-row gap-3">
                <ListSkeleton count={1} />
              </View>
            ) : error ? (
              <ErrorState onRetry={refetch} />
            ) : stats ? (
              <>
                <View className="flex-row gap-3">
                  <StatCard label="Sessions" value={stats.sessions} icon={<Icon icon={METRIC_ICONS.sessions} size={16} color="primary" />} accent />
                  <StatCard label="Volume" value={formatVolume(stats.totalVolume, unit)} icon={<Icon icon={METRIC_ICONS.volume} size={16} color="info" />} />
                  <StatCard label="Streak" value={`${stats.streak}w`} icon={<Icon icon={METRIC_ICONS.streak} size={16} color="warning" />} />
                </View>

                {stats.trend ? (
                  <View className="flex-row flex-wrap gap-2">
                    <TrendChip label="vs previous" delta={stats.trend.volumeDelta} />
                    <TrendChip label="sessions" delta={stats.trend.sessionsDelta} />
                  </View>
                ) : null}

                <Card>
                  <CardHeader>
                    <View>
                      <CardTitle>Volume</CardTitle>
                      <CardDescription>
                        {range === '1w'
                          ? 'Last 7 days'
                          : range === '30d'
                            ? 'Last 30 days'
                            : range === '3m'
                              ? 'Last 3 months'
                              : range === '1y'
                                ? 'Last year'
                                : 'All time'}
                      </CardDescription>
                    </View>
                    <Icon icon={TrendingUp} size={18} color="muted-foreground" />
                  </CardHeader>
                  <VolumeChart data={volumeData} unit={unit} />
                </Card>

                <Pressable
                  onPress={() => router.push('/(app)/muscle-distribution' as Href)}
                  accessibilityRole="button"
                  accessibilityLabel="Open muscle distribution">
                  <Card>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <Body className="font-semibold text-foreground">Muscle distribution</Body>
                        <Caption className="mt-1">
                          {topMuscle
                            ? `Top: ${MUSCLE_LABELS[topMuscle.muscle]} · ${topMuscle.sets} sets`
                            : 'Body map and balance radar'}
                        </Caption>
                      </View>
                      <Icon icon={ChevronRight} size={18} color="muted-foreground" />
                    </View>
                  </Card>
                </Pressable>

                <Pressable
                  onPress={() => router.push('/(app)/progress-photos' as Href)}
                  accessibilityRole="button"
                  accessibilityLabel="Open progress photos">
                  <Card>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <View className="flex-row items-center gap-2">
                          <Icon icon={Camera} size={16} color="muted-foreground" />
                          <Body className="font-semibold text-foreground">Photos</Body>
                        </View>
                        <Caption className="mt-1">Week vs week, on this device</Caption>
                      </View>
                      <Icon icon={ChevronRight} size={18} color="muted-foreground" />
                    </View>
                  </Card>
                </Pressable>

                <Pressable
                  onPress={() => router.push('/(app)/report/month' as Href)}
                  accessibilityRole="button"
                  accessibilityLabel="Open monthly reports">
                  <Card>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 pr-3">
                        <View className="flex-row items-center gap-2">
                          <Icon icon={CalendarRange} size={16} color="muted-foreground" />
                          <Body className="font-semibold text-foreground">Monthly reports</Body>
                        </View>
                        <Caption className="mt-1">
                          {formatMonthLabel(previousMonthStart())} recap · kept even when dismissed
                        </Caption>
                      </View>
                      <Icon icon={ChevronRight} size={18} color="muted-foreground" />
                    </View>
                  </Card>
                </Pressable>

                <View>
                  <SectionHeader title="Records" className="mb-3" />
                  {stats.prs.length > 0 ? (
                    <View className="gap-2.5">
                      {stats.prs.slice(0, 5).map((pr) => (
                        <PRCard key={pr.exerciseId} pr={pr} unit={unit} />
                      ))}
                    </View>
                  ) : (
                    <EmptyState title="No records yet" description="Log a few workouts to see your PRs." />
                  )}
                </View>

                <SectionHeader title="History" className="mt-1" />
                <HistoryFilters
                  range={historyRange}
                  onRangeChange={setHistoryRange}
                  exercise={historyExercise}
                  onExerciseChange={setHistoryExercise}
                  template={historyTemplate}
                  onTemplateChange={setHistoryTemplate}
                  onOpenExerciseSheet={() => setExerciseSheetOpen(true)}
                  onOpenTemplateSheet={() => setTemplateSheetOpen(true)}
                />
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          history.items.length === 0 && !history.loading ? (
            <EmptyState
              icon={<Icon icon={Dumbbell} size={28} color="muted-foreground" />}
              title={historyFiltered ? 'No matching workouts' : 'No workouts logged'}
              description={
                historyFiltered
                  ? 'Try a wider date range or clear exercise / template filters.'
                  : 'Complete a workout to start building your history.'
              }
              actionLabel={historyFiltered ? 'Clear filters' : undefined}
              onAction={historyFiltered ? clearHistoryFilters : undefined}
            />
          ) : null
        }
        ListFooterComponent={
          history.loading && history.items.length > 0 ? (
            <View className="py-4"><PrimaryActivityIndicator /></View>
          ) : null
        }
      />

      {/* Sheets must sit outside FlashList or they render empty on native. */}
      <HistoryExerciseFilterSheet
        open={exerciseSheetOpen}
        onOpenChange={setExerciseSheetOpen}
        selectedId={historyExercise?.id ?? null}
        onPick={(picked) => {
          setHistoryExercise(picked);
          setExerciseSheetOpen(false);
        }}
        onClear={() => {
          setHistoryExercise(null);
          setExerciseSheetOpen(false);
        }}
      />
      <HistoryTemplateFilterSheet
        open={templateSheetOpen}
        onOpenChange={setTemplateSheetOpen}
        selectedId={historyTemplate?.id ?? null}
        onPick={(picked) => {
          setHistoryTemplate(picked);
          setTemplateSheetOpen(false);
        }}
        onClear={() => {
          setHistoryTemplate(null);
          setTemplateSheetOpen(false);
        }}
      />
    </SafeAreaView>
  );
}
