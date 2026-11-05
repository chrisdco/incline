import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { ListGroup, ListRow } from '@/components/layout';
import { Body, Caption } from '@/components/common/text';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SegmentedControl } from '@/components/common/segmented-control';
import { EmptyState, ErrorState } from '@/components/common/states';
import { ListSkeleton } from '@/components/common/skeleton';
import { MuscleRadar } from '@/components/progress/muscle-radar';
import { MuscleBodyMap } from '@/components/progress/muscle-body-map';
import { StatCard } from '@/components/common/stat-card';
import { usePeriodStats } from '@/hooks/use-data';
import { useSettings } from '@/store/settings-store';
import { formatVolume } from '@/db/calc';
import { getMuscleExposureDays } from '@/db/queries';
import { muscleBalanceInsights, recoveryGapInsights } from '@/coaching/insights';
import { MUSCLE_LABELS } from '@/lib/labels';
import { SCREEN_CONTENT } from '@/lib/layout';
import { METRIC_ICONS } from '@/lib/metric-icons';
import type { ProgressRange } from '@/db/types';

const RANGES: { value: ProgressRange; label: string }[] = [
  { value: '1w', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '3m', label: '3M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
];

export default function MuscleDistributionScreen() {
  const router = useRouter();
  const unit = useSettings((s) => s.unit);
  const [range, setRange] = useState<ProgressRange>('30d');
  const { data: stats, loading, error, refetch } = usePeriodStats(range);
  const [exposure, setExposure] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    void getMuscleExposureDays().then(setExposure);
  }, []);

  const topMuscles = useMemo(() => {
    const list = [...(stats?.muscleDistribution ?? [])].sort((a, b) => b.sets - a.sets);
    return list.slice(0, 3);
  }, [stats]);

  const leastMuscles = useMemo(() => {
    const list = [...(stats?.muscleDistribution ?? [])].sort((a, b) => a.sets - b.sets);
    return list.slice(0, 3);
  }, [stats]);

  const coachingNotes = useMemo(() => {
    if (!stats) return [];
    return [...recoveryGapInsights(exposure), ...muscleBalanceInsights(stats.muscleDistribution)];
  }, [stats, exposure]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <Body className="text-base font-semibold text-foreground">Muscle distribution</Body>
        <View className="w-8" />
      </View>

      <ScrollView contentContainerStyle={SCREEN_CONTENT} showsVerticalScrollIndicator={false}>
        <Caption className="mb-4">Where your sets landed this period.</Caption>
        <SegmentedControl value={range} onChange={setRange} values={RANGES} className="mb-5" />

        {loading && !stats ? (
          <ListSkeleton count={2} />
        ) : error ? (
          <ErrorState onRetry={refetch} />
        ) : !stats || stats.muscleDistribution.length === 0 ? (
          <EmptyState title="No muscle data" description="Complete a few workouts to see distribution." />
        ) : (
          <View className="gap-5">
            <View className="flex-row gap-3">
              <StatCard label="Sessions" value={stats.sessions} icon={<Icon icon={METRIC_ICONS.sessions} size={16} color="muted-foreground" />} />
              <StatCard label="Volume" value={formatVolume(stats.totalVolume, unit)} icon={<Icon icon={METRIC_ICONS.volume} size={16} color="info" />} />
              <StatCard label="Sets" value={stats.totalSets} icon={<Icon icon={METRIC_ICONS.sets} size={16} color="muted-foreground" />} />
            </View>

            <Card>
              <CardHeader>
                <View>
                  <CardTitle>Body map</CardTitle>
                  <CardDescription>Intensity by sets trained</CardDescription>
                </View>
              </CardHeader>
              <MuscleBodyMap distribution={stats.muscleDistribution} scale={1.05} className="mt-2" />
            </Card>

            <Card>
              <CardHeader>
                <View>
                  <CardTitle>Balance</CardTitle>
                  <CardDescription>
                    {range === 'all'
                      ? 'Fixed hexagon — zeros where you have not trained'
                      : 'This period vs the equal window before it'}
                  </CardDescription>
                </View>
              </CardHeader>
              <MuscleRadar
                current={stats.muscleDistribution}
                previous={stats.previousMuscleDistribution}
                comparePrevious={range !== 'all'}
                className="mt-2"
              />
            </Card>

            {coachingNotes.length > 0 ? (
              <View>
                <Body className="mb-3 text-lg font-semibold text-foreground">Coaching</Body>
                <ListGroup>
                  {coachingNotes.map((note) => (
                    <ListRow key={note.id} title={note.title} subtitle={note.body} />
                  ))}
                </ListGroup>
              </View>
            ) : null}

            {topMuscles.length > 0 ? (
              <View>
                <Body className="mb-3 text-lg font-semibold text-foreground">Most trained</Body>
                <ListGroup>
                  {topMuscles.map((m, i) => (
                    <ListRow key={m.muscle} title={`${i + 1}. ${MUSCLE_LABELS[m.muscle]}`}>
                      <Caption className="tabular-nums">{m.sets} sets</Caption>
                    </ListRow>
                  ))}
                </ListGroup>
              </View>
            ) : null}

            {leastMuscles.length > 0 && leastMuscles[0].muscle !== topMuscles[0]?.muscle ? (
              <View>
                <Body className="mb-3 text-lg font-semibold text-foreground">Least trained</Body>
                <ListGroup>
                  {leastMuscles.map((m) => (
                    <ListRow key={`least-${m.muscle}`} title={MUSCLE_LABELS[m.muscle]}>
                      <Caption className="tabular-nums">{m.sets} sets</Caption>
                    </ListRow>
                  ))}
                </ListGroup>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
