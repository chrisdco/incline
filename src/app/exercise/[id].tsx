import { useState, useEffect, useMemo, useLayoutEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Dumbbell, Lightbulb, Trophy } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Heading, Body, Caption } from '@/components/common/text';
import { ExerciseMedia } from '@/components/exercise/exercise-media';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SegmentedControl } from '@/components/common/segmented-control';
import { EmptyState, ErrorState } from '@/components/common/states';
import { ListSkeleton } from '@/components/common/skeleton';
import { SeriesAreaChart } from '@/components/progress/series-area-chart';
import { MuscleBodyMap } from '@/components/progress/muscle-body-map';
import { useExercise, useExerciseHistory } from '@/hooks/use-data';
import {
  getExerciseByExternalId,
  getExercisePRSummary,
  getExerciseRepRecords,
  getExerciseSeries,
  type ExercisePRSummary,
  type RepRecord,
  type ExerciseSeriesPoint,
} from '@/db/queries';
import { useSettings } from '@/store/settings-store';
import { MOVEMENT_LABELS, MUSCLE_LABELS } from '@/lib/labels';
import { estimated1RM, formatWeight, formatVolume, relativeTime } from '@/db/calc';
import type { Exercise, ExerciseHistoryRow, Unit } from '@/db/types';

const TABS = ['Summary', 'Progress', 'History', 'How to'] as const;
type Tab = typeof TABS[number];
const TAB_VALUES = TABS.map((t) => ({ value: t, label: t }));

interface SessionGroup {
  workoutLogId: number;
  workoutName: string;
  startedAt: number;
  sets: ExerciseHistoryRow[];
}

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { unit } = useSettings();
  const navigation = useNavigation();
  const [tab, setTab] = useState<Tab>('Summary');

  const isSupabaseId = typeof id === 'string' && id.startsWith('supabase:');
  const externalId = isSupabaseId ? id.replace('supabase:', '') : null;
  const localId = !isSupabaseId ? Number(id) : 0;

  const { data: localExercise, loading: localLoading, error: localError, refetch: localRefetch } = useExercise(localId);
  const [supabaseExercise, setSupabaseExercise] = useState<Exercise | null>(null);
  const [supabaseLoading, setSupabaseLoading] = useState(false);

  useEffect(() => {
    if (externalId) {
      setSupabaseLoading(true);
      getExerciseByExternalId(externalId).then((ex) => {
        setSupabaseExercise(ex);
        setSupabaseLoading(false);
      });
    }
  }, [externalId]);

  const exercise = isSupabaseId ? supabaseExercise : localExercise;
  const loading = isSupabaseId ? supabaseLoading : localLoading;
  const error = isSupabaseId ? !supabaseExercise && !supabaseLoading : localError;
  const refetch = isSupabaseId ? () => {} : localRefetch;
  const exerciseId = exercise?.id ?? 0;

  const { data: history } = useExerciseHistory(exerciseId);
  const [prSummary, setPrSummary] = useState<ExercisePRSummary | null>(null);
  const [repRecords, setRepRecords] = useState<RepRecord[]>([]);
  const [series, setSeries] = useState<ExerciseSeriesPoint[]>([]);

  useEffect(() => {
    if (!exerciseId) return;
    getExercisePRSummary(exerciseId).then(setPrSummary);
    getExerciseRepRecords(exerciseId).then(setRepRecords);
    getExerciseSeries(exerciseId).then(setSeries);
  }, [exerciseId]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: true, title: '' });
  }, [navigation]);

  const sessions = useMemo<SessionGroup[]>(() => {
    const groups: SessionGroup[] = [];
    for (const row of history ?? []) {
      let g = groups.find((x) => x.workoutLogId === row.workoutLogId);
      if (!g) {
        g = { workoutLogId: row.workoutLogId, workoutName: row.workoutName, startedAt: row.startedAt, sets: [] };
        groups.push(g);
      }
      g.sets.push(row);
    }
    return groups;
  }, [history]);

  // Determine PRs for individual sets
  const maxWeight = prSummary?.heaviestWeight ?? 0;
  const max1RM = prSummary?.best1RM ?? 0;

  if (loading) return <ListSkeleton count={2} />;
  if (error || !exercise)
    return <ErrorState onRetry={refetch} title="Exercise not found" description="It may have been removed." />;

  return (
    <View className="flex-1 bg-background">
      {/* Exercise header */}
      <View className="flex-row items-center gap-3 px-4 pt-2">
        <View className="h-10 w-10 items-center justify-center rounded-2xl bg-muted">
          <Icon icon={Dumbbell} size={20} color="muted-foreground" />
        </View>
        <View className="flex-1">
          <Heading style={{ fontSize: 18 }}>{exercise.name}</Heading>
          <Caption>Primary: {MUSCLE_LABELS[exercise.primaryMuscle]}</Caption>
        </View>
      </View>

      {/* Tab selector */}
      <View className="mt-3 px-4">
        <SegmentedControl values={TAB_VALUES} value={tab} onChange={(v) => setTab(v)} />
      </View>

      {/* Tab content */}
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {tab === 'Summary' && (
          <SummaryTab
            exercise={exercise}
            prSummary={prSummary}
            repRecords={repRecords}
            unit={unit}
          />
        )}
        {tab === 'Progress' && (
          <ProgressTab series={series} unit={unit} />
        )}
        {tab === 'History' && (
          <HistoryTab sessions={sessions} unit={unit} maxWeight={maxWeight} max1RM={max1RM} />
        )}
        {tab === 'How to' && (
          <HowToTab exercise={exercise} />
        )}
      </ScrollView>
    </View>
  );
}

/* ───────────── Summary Tab ───────────── */

function chartDateLabel(iso: string): string {
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[Number(parts[1]) - 1] ?? parts[1];
  return `${Number(parts[2])} ${month}`;
}

function SummaryTab({
  exercise, prSummary, repRecords, unit,
}: {
  exercise: Exercise;
  prSummary: ExercisePRSummary | null;
  repRecords: RepRecord[];
  unit: Unit;
}) {
  return (
    <View>
      {/* Exercise GIF / illustration */}
      <ExerciseMedia name={exercise.name} aliases={exercise.aliases} imageUrl={exercise.imageUrl} height={200} />

      {/* Muscle info */}
      <View className="mb-4 flex-row flex-wrap gap-2">
        {exercise.movementPattern ? <Badge variant="outline">{MOVEMENT_LABELS[exercise.movementPattern]}</Badge> : null}
        {exercise.isCompound ? <Badge variant="default">Compound</Badge> : <Badge variant="secondary">Isolation</Badge>}
      </View>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Muscles</CardTitle>
        </CardHeader>
        <MuscleBodyMap
          muscles={[exercise.primaryMuscle, ...exercise.secondaryMuscles]}
          scale={0.9}
          className="mt-1"
        />
        <View className="mt-3 flex-row flex-wrap gap-2">
          <Badge variant="default">{MUSCLE_LABELS[exercise.primaryMuscle]}</Badge>
          {exercise.secondaryMuscles.map((m) => (
            <Badge key={m} variant="outline">
              {MUSCLE_LABELS[m]}
            </Badge>
          ))}
        </View>
      </Card>

      {/* Personal Records */}
      {prSummary && prSummary.heaviestWeight > 0 ? (
        <Card className="mb-4">
          <CardHeader>
            <Icon icon={Trophy} size={18} color="warning" />
            <CardTitle>Personal Records</CardTitle>
          </CardHeader>
          <View className="gap-3">
            <PRRow label="Heaviest Weight" value={formatWeight(prSummary.heaviestWeight, unit)} />
            <PRRow label="Best 1RM" value={formatWeight(prSummary.best1RM, unit)} />
            <PRRow label="Best Set Volume" value={`${formatWeight(prSummary.bestSetVolume, unit)}`} />
            <PRRow label="Best Session Volume" value={`${formatWeight(prSummary.bestSessionVolume, unit)}`} />
          </View>
        </Card>
      ) : null}

      {/* Set Records by rep range */}
      {repRecords.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Set Records</CardTitle>
          </CardHeader>
          <View className="flex-row border-b border-border pb-2 mb-2">
            <Caption style={{ width: 60 }}>Reps</Caption>
            <Caption>Personal Best</Caption>
          </View>
          {repRecords.map((r) => (
            <View key={r.reps} className="flex-row py-1.5">
              <Body style={{ width: 60 }} className="text-sm text-foreground">{r.reps}</Body>
              <Body className="text-sm font-medium text-primary">{formatWeight(r.weight, unit)}</Body>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Tips */}
      {exercise.tips ? (
        <Card className="mt-4 flex-row gap-3">
          <Icon icon={Lightbulb} size={20} color="warning" />
          <Body className="flex-1 text-sm text-foreground">{exercise.tips}</Body>
        </Card>
      ) : null}
    </View>
  );
}

/* ───────────── Progress Tab ───────────── */

function ProgressTab({
  series,
  unit,
}: {
  series: ExerciseSeriesPoint[];
  unit: Unit;
}) {
  const chartPoints = series.map((p) => ({
    label: chartDateLabel(p.date),
    e1rm: p.estimated1RM,
    setVolume: p.setVolume,
    weight: p.heaviestWeight,
  }));

  if (chartPoints.length < 2) {
    return (
      <EmptyState
        title="Not enough data yet"
        description="Complete a few sets of this exercise to see 1RM, volume, and weight trends."
      />
    );
  }

  return (
    <View className="gap-4">
      <SeriesAreaChart
        title="Estimated 1RM"
        points={chartPoints.map((p) => ({ label: p.label, value: p.e1rm }))}
        formatValue={(v) => formatWeight(v, unit)}
        valueHint={unit === 'metric' ? 'kg' : 'lb'}
      />
      <SeriesAreaChart
        title="Set Volume"
        points={chartPoints.map((p) => ({ label: p.label, value: p.setVolume }))}
        formatValue={(v) => formatVolume(v, unit)}
        valueHint="volume"
      />
      <SeriesAreaChart
        title="Heaviest weight"
        points={chartPoints.map((p) => ({ label: p.label, value: p.weight }))}
        formatValue={(v) => formatWeight(v, unit)}
        valueHint={unit === 'metric' ? 'kg' : 'lb'}
      />
    </View>
  );
}

function PRRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Body className="text-sm text-foreground">{label}</Body>
      <Body className="text-sm font-semibold text-primary">{value}</Body>
    </View>
  );
}

/* ───────────── History Tab ───────────── */

function HistoryTab({
  sessions, unit, maxWeight, max1RM,
}: {
  sessions: SessionGroup[];
  unit: Unit;
  maxWeight: number;
  max1RM: number;
}) {
  if (sessions.length === 0) {
    return <EmptyState title="No history yet" description="Log this exercise in a workout to track your progress." />;
  }

  return (
    <View className="gap-4">
      {sessions.map((s) => (
        <Card key={s.workoutLogId}>
          <View className="mb-2">
            <Body className="font-semibold text-foreground">{s.workoutName}</Body>
            <Caption>{relativeTime(s.startedAt)}</Caption>
          </View>
          <View className="flex-row border-b border-border pb-2 mb-2">
            <Caption style={{ width: 40 }}>SET</Caption>
            <Caption>WEIGHT & REPS</Caption>
          </View>
          {s.sets.map((set) => {
            const isWeightPR = set.weight === maxWeight && set.weight > 0;
            const set1RM = estimated1RM(set.weight, set.reps);
            const is1RMPR = Math.abs(set1RM - max1RM) < 0.1 && set1RM > 0;
            return (
              <View key={set.setIndex} className="flex-row items-center py-1.5">
                <Body style={{ width: 40 }} className="text-sm text-foreground">{set.setIndex + 1}</Body>
                <Body className="text-sm text-foreground">
                  {formatWeight(set.weight, unit)} × {set.reps}
                  {set.rpe != null ? ` · RPE ${set.rpe}` : ''}
                </Body>
                {isWeightPR ? (
                  <Badge variant="default" className="ml-2 bg-yellow-500">
                    <Icon icon={Trophy} size={10} color="white" />
                    <Caption className="ml-1 text-white">Weight</Caption>
                  </Badge>
                ) : null}
                {is1RMPR && !isWeightPR ? (
                  <Badge variant="default" className="ml-2 bg-yellow-500">
                    <Icon icon={Trophy} size={10} color="white" />
                    <Caption className="ml-1 text-white">1RM</Caption>
                  </Badge>
                ) : null}
              </View>
            );
          })}
        </Card>
      ))}
    </View>
  );
}

/* ───────────── How to Tab ───────────── */

function HowToTab({ exercise }: { exercise: Exercise }) {
  return (
    <View>
      {/* Exercise GIF / illustration */}
      <ExerciseMedia name={exercise.name} aliases={exercise.aliases} imageUrl={exercise.imageUrl} height={220} />

      <Heading style={{ fontSize: 18, marginBottom: 12 }}>{exercise.name}</Heading>

      {exercise.instructions.length > 0 ? (
        <View className="gap-4">
          {exercise.instructions.map((step, i) => (
            <View key={i} className="flex-row gap-3">
              <View className="h-7 w-7 items-center justify-center rounded-full bg-primary/15">
                <Caption className="text-primary font-semibold">{i + 1}</Caption>
              </View>
              <Body className="flex-1 text-sm text-foreground">{step}</Body>
            </View>
          ))}
        </View>
      ) : (
        <EmptyState title="No instructions" description="Instructions for this exercise are not available yet." />
      )}

      {exercise.tips ? (
        <Card className="mt-6 flex-row gap-3">
          <Icon icon={Lightbulb} size={20} color="warning" />
          <Body className="flex-1 text-sm text-foreground">{exercise.tips}</Body>
        </Card>
      ) : null}
    </View>
  );
}
