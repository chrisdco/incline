import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Award, ChevronRight, Share2 } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption, Hero } from '@/components/common/text';
import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/common/segmented-control';
import { MuscleRadar } from '@/components/progress/muscle-radar';
import { MonthDayGrid } from '@/components/report/month-day-grid';
import { MonthSparkBars } from '@/components/report/month-spark-bars';
import { MuscleSetBars } from '@/components/report/muscle-set-bars';
import {
  formatDuration,
  formatMonthLabel,
  formatVolume,
  formatWeight,
  previousMonthStart,
} from '@/db/calc';
import { useMonthlyRecap, useProfile } from '@/hooks/use-data';
import { useSettings } from '@/store/settings-store';
import { SCREEN_CONTENT_CTA } from '@/lib/layout';
import { METRIC_ICONS } from '@/lib/metric-icons';
import { cn } from '@/lib/cn';
import { shareHandleFromName } from '@/lib/share-chrome';
import type { MonthSeriesPoint, Unit } from '@/db/types';

type SparkMetric = 'sessions' | 'duration' | 'volume' | 'sets';

const SPARK_TABS: { value: SparkMetric; label: string }[] = [
  { value: 'sessions', label: 'Workouts' },
  { value: 'duration', label: 'Duration' },
  { value: 'volume', label: 'Volume' },
  { value: 'sets', label: 'Sets' },
];

function sparkValue(p: MonthSeriesPoint, metric: SparkMetric): number {
  if (metric === 'sessions') return p.sessions;
  if (metric === 'duration') return p.durationSeconds;
  if (metric === 'volume') return p.volume;
  return p.sets;
}

function formatSparkValue(metric: SparkMetric, n: number, unit: Unit): string {
  if (metric === 'sessions' || metric === 'sets') return String(n);
  if (metric === 'duration') return formatDuration(n);
  return formatVolume(n, unit);
}

function DeltaLine({
  current,
  previous,
  format,
}: {
  current: number;
  previous: number;
  format: (n: number) => string;
}) {
  const d = current - previous;
  const up = d >= 0;
  return (
    <Caption className={cn('text-sm font-semibold', up ? 'text-success' : 'text-muted-foreground')}>
      {up ? '↑' : '↓'} {format(Math.abs(d))}
    </Caption>
  );
}

function Kpi({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: ReactNode;
}) {
  return (
    <View className="min-h-[108px] flex-1 rounded-2xl border border-border px-4 py-4">
      <Caption className="text-[13px]">{label}</Caption>
      <Hero className="mt-2 text-[28px] leading-8">{value}</Hero>
      <View className="mt-1">{delta}</View>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Caption className="mb-3 mt-10 text-[15px]">{children}</Caption>;
}

export default function MonthReportScreen() {
  const { monthStartMs: monthStartParam } = useLocalSearchParams<{ monthStartMs?: string }>();
  const defaultStart = previousMonthStart();
  const monthStartMs = monthStartParam ? Number(monthStartParam) : defaultStart;
  const router = useRouter();
  const { unit, weekStartsOn } = useSettings();
  const { data: profile } = useProfile();
  const { data: recap, loading } = useMonthlyRecap(
    Number.isFinite(monthStartMs) ? monthStartMs : defaultStart,
  );
  const [sparkMetric, setSparkMetric] = useState<SparkMetric>('sessions');

  if (loading || !recap) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <PrimaryActivityIndicator />
      </SafeAreaView>
    );
  }

  const label = formatMonthLabel(recap.monthStartMs);
  const prevLabel = formatMonthLabel(previousMonthStart(recap.monthStartMs));
  const shareHref = `/share/month?monthStartMs=${recap.monthStartMs}` as Href;
  const handle = shareHandleFromName(profile?.name?.trim() || '');
  const displayName = profile?.name?.trim() || handle.replace('@', '');
  const currentPoint = recap.yearSeries.find((p) => p.monthKey === recap.monthKey) ?? recap.yearSeries.at(-1);
  const sparkPoints = recap.yearSeries.map((p) => ({
    key: p.monthKey,
    label: p.label,
    value: sparkValue(p, sparkMetric),
    active: p.monthKey === recap.monthKey,
  }));

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <Body className="text-lg font-semibold text-foreground">{label.replace(/ \d+$/, '')} Report</Body>
        <View className="w-8" />
      </View>

      <ScrollView contentContainerStyle={SCREEN_CONTENT_CTA} showsVerticalScrollIndicator={false}>
        <Hero className="text-[32px] leading-10">{label}</Hero>
        {currentPoint ? (
          <View className="mt-2 flex-row items-end gap-2">
            <Hero className="text-[34px] leading-10">{formatSparkValue(sparkMetric, sparkValue(currentPoint, sparkMetric), unit)}</Hero>
            <View className="mb-1">
              <DeltaLine
                current={sparkValue(currentPoint, sparkMetric)}
                previous={
                  sparkMetric === 'sessions'
                    ? recap.previousSessions
                    : sparkMetric === 'duration'
                      ? recap.previousDurationSeconds
                      : sparkMetric === 'volume'
                        ? recap.previousVolume
                        : recap.previousSets
                }
                format={(n) => formatSparkValue(sparkMetric, n, unit)}
              />
            </View>
          </View>
        ) : null}

        <View className="mt-5">
          <MonthSparkBars points={sparkPoints} />
        </View>
        <View className="mt-4">
          <SegmentedControl values={SPARK_TABS} value={sparkMetric} onChange={setSparkMetric} />
        </View>

        <SectionLabel>Summary</SectionLabel>
        <View className="gap-3">
          <View className="flex-row gap-3">
            <Kpi
              label="Workouts"
              value={String(recap.sessions)}
              delta={<DeltaLine current={recap.sessions} previous={recap.previousSessions} format={(n) => String(n)} />}
            />
            <Kpi
              label="Duration"
              value={formatDuration(recap.durationSeconds)}
              delta={
                <DeltaLine
                  current={recap.durationSeconds}
                  previous={recap.previousDurationSeconds}
                  format={(n) => formatDuration(n)}
                />
              }
            />
          </View>
          <View className="flex-row gap-3">
            <Kpi
              label="Volume"
              value={formatVolume(recap.totalVolume, unit)}
              delta={
                <DeltaLine
                  current={recap.totalVolume}
                  previous={recap.previousVolume}
                  format={(n) => formatVolume(n, unit)}
                />
              }
            />
            <Kpi
              label="Sets"
              value={String(recap.totalSets)}
              delta={<DeltaLine current={recap.totalSets} previous={recap.previousSets} format={(n) => String(n)} />}
            />
          </View>
        </View>

        <SectionLabel>Personal Records</SectionLabel>
        <View className="flex-row items-center gap-3">
          <Icon icon={Award} size={28} color="warning" />
          <Hero className="text-[22px] leading-7">
            {recap.prs.length} new PR{recap.prs.length === 1 ? '' : 's'}
          </Hero>
        </View>
        {recap.prs.length > 0 ? (
          <View className="mt-4 gap-4">
            {recap.prs.slice(0, 6).map((pr) => (
              <Pressable
                key={pr.exerciseId}
                onPress={() => router.push(`/exercise/${pr.exerciseId}` as Href)}
                accessibilityRole="button"
                accessibilityLabel={pr.exerciseName}
                className="gap-2">
                <View className="flex-row items-center justify-between">
                  <Body className="flex-1 text-base font-semibold text-foreground" numberOfLines={1}>
                    {pr.exerciseName}
                  </Body>
                  <Icon icon={ChevronRight} size={18} color="muted-foreground" />
                </View>
                <View className="flex-row items-center gap-2">
                  <Icon icon={Award} size={14} color="warning" />
                  <Caption className="text-foreground">1RM · {formatWeight(pr.estimated1RM, unit)}</Caption>
                </View>
                <View className="flex-row items-center gap-2">
                  <Icon icon={Award} size={14} color="warning" />
                  <Caption className="text-foreground">Volume · {formatWeight(pr.bestSetVolume, unit)}</Caption>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <Caption className="mt-2">No new records this month.</Caption>
        )}

        <SectionLabel>Workout Days Log</SectionLabel>
        <View className="mb-4 flex-row items-center gap-3">
          <Icon icon={METRIC_ICONS.streak} size={22} color="destructive" />
          <Hero className="text-[22px] leading-7">{recap.streak} week streak</Hero>
        </View>
        <MonthDayGrid
          monthStartMs={recap.monthStartMs}
          trainedDayMs={recap.trainedDayMs}
          weekStartsOn={weekStartsOn}
        />

        {recap.muscles.some((m) => m.sets > 0) ? (
          <>
            <SectionLabel>Muscle Distribution</SectionLabel>
            <MuscleRadar
              current={recap.muscles}
              previous={recap.previousMuscles}
              currentLabel={label}
              previousLabel={prevLabel}
            />
            <SectionLabel>Main Muscle Groups</SectionLabel>
            <MuscleSetBars muscles={recap.muscles} />
          </>
        ) : null}

        {recap.topExercises.length > 0 ? (
          <>
            <SectionLabel>Top Exercises</SectionLabel>
            <View>
              {recap.topExercises.map((ex, i) => (
                <Pressable
                  key={ex.exerciseId}
                  onPress={() => router.push(`/exercise/${ex.exerciseId}` as Href)}
                  accessibilityRole="button"
                  accessibilityLabel={ex.exerciseName}
                  className={cn('flex-row items-center gap-3 py-3.5', i > 0 && 'border-t border-border/70')}>
                  <View className="min-w-0 flex-1">
                    <Body className="text-base font-semibold text-foreground" numberOfLines={1}>
                      {ex.exerciseName}
                    </Body>
                    <Caption className="mt-0.5">
                      {ex.sets} time{ex.sets === 1 ? '' : 's'}
                    </Caption>
                  </View>
                  <Icon icon={ChevronRight} size={20} color="muted-foreground" />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <Hero className="mt-12 text-center text-[22px] leading-8">
          Congrats on a great month {displayName}! 👏
        </Hero>
        <Caption className="mt-2 text-center text-[15px] leading-5">
          Celebrate your achievements and motivate others by sharing your journey!
        </Caption>
      </ScrollView>

      <View className="border-t border-border/60 bg-background px-4 pb-8 pt-3">
        <Button
          size="lg"
          leftIcon={<Icon icon={Share2} size={18} color="primary-foreground" />}
          onPress={() => router.push(shareHref)}>
          Share
        </Button>
      </View>
    </SafeAreaView>
  );
}
