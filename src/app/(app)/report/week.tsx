import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Share2 } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption, Hero } from '@/components/common/text';
import { PrimaryActivityIndicator } from
'@/components/common/primary-activity-indicator';
import { ErrorState } from '@/components/common/states';
import { StatCard } from '@/components/common/stat-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PRCard } from '@/components/progress/pr-card';
import { MuscleBodyMap } from '@/components/progress/muscle-body-map';
import { formatVolume, startOfWeek, formatWeekRangeLabel } from '@/db/calc';
import { useWeeklyRecap } from '@/hooks/use-data';
import { useSettings } from '@/store/settings-store';
import { SCREEN_CONTENT } from '@/lib/layout';
import { METRIC_ICONS } from '@/lib/metric-icons';
import type { MuscleGroup } from '@/db/types';

export default function WeekReportScreen() {
  const { weekStartMs: weekStartParam } = useLocalSearchParams<{ weekStartMs?: string }>();
  const [defaultWeekStart] = useState(() => startOfWeek(Date.now()));
  const weekStartMs = weekStartParam ? Number(weekStartParam) : defaultWeekStart;
  const router = useRouter();
  const { unit } = useSettings();
  const { data: recap, loading, error, refetch } = useWeeklyRecap(
    Number.isFinite(weekStartMs) ? weekStartMs : defaultWeekStart,
  );

  if (loading && !recap) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <PrimaryActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!recap) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <ErrorState
          title="Could not load this report"
          description={error ? 'The recap query failed. Your data is safe.' : 'No recap for this week yet.'}
          onRetry={refetch}
        />
      </SafeAreaView>
    );
  }

  const rangeLabel = formatWeekRangeLabel(recap.weekStartMs);
  const volumeLabel = formatVolume(recap.totalVolume, unit);
  const muscles = recap.muscles.map((m) => m.muscle) as MuscleGroup[];
  const delta =
    recap.volumeDeltaPct === null
      ? null
      : `${recap.volumeDeltaPct > 0 ? '+' : ''}${recap.volumeDeltaPct}% vs prior week`;
  const shareHref = `/share/week?weekStartMs=${recap.weekStartMs}` as Href;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <Body className="text-base font-semibold text-foreground">Weekly report</Body>
        <Pressable
          onPress={() => router.push(shareHref)}
          className="p-1"
          accessibilityRole="button"
          accessibilityLabel="Share week">
          <Icon icon={Share2} size={22} color="foreground" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={SCREEN_CONTENT} showsVerticalScrollIndicator={false}>
        <Caption>{rangeLabel}</Caption>
        <Hero className="mt-1">Your week</Hero>
        <Body className="mt-2 text-muted-foreground">{recap.insightLine}</Body>
        {delta ? <Caption className="mt-1 text-foreground/80">{delta}</Caption> : null}

        <View className="mt-6 flex-row gap-3">
          <StatCard
            label="Sessions"
            value={recap.sessions}
            icon={<Icon icon={METRIC_ICONS.sessions} size={16} color="muted-foreground" />}
          />
          <StatCard
            label="Volume"
            value={volumeLabel}
            icon={<Icon icon={METRIC_ICONS.volume} size={16} color="info" />}
          />
          <StatCard
            label="Streak"
            value={`${recap.streak}w`}
            icon={<Icon icon={METRIC_ICONS.streak} size={16} color="warning" />}
          />
        </View>

        <Caption className="mb-2 mt-6 font-semibold uppercase tracking-wide">Sets</Caption>
        <Card>
          <Body className="font-semibold text-foreground">{recap.totalSets} completed sets</Body>
          <Caption className="mt-1">Across all finished sessions this week</Caption>
        </Card>

        {recap.prs.length > 0 ? (
          <>
            <Caption className="mb-2 mt-6 font-semibold uppercase tracking-wide">
              Records
            </Caption>
            <View className="gap-2">
              {recap.prs.slice(0, 6).map((pr) => (
                <PRCard key={pr.exerciseId} pr={pr} unit={unit} />
              ))}
            </View>
          </>
        ) : null}

        {muscles.length > 0 ? (
          <>
            <Caption className="mb-2 mt-6 font-semibold uppercase tracking-wide">Muscles</Caption>
            <Card>
              <View className="items-center py-2">
                <MuscleBodyMap muscles={muscles} compact />
              </View>
            </Card>
          </>
        ) : null}

        <Button
          className="mt-8"
          leftIcon={<Icon icon={Share2} size={16} color="primary-foreground" />}
          onPress={() => router.push(shareHref)}>
          Share slides
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
