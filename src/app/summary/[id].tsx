import { useAppAuth } from '@/auth/use-app-auth';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Medal, MoreHorizontal, PencilLine, Share2 } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';
import { Tappable } from '@/components/ui/tappable';

import { Body, Caption, Text } from '@/components/common/text';
import { Section, StatBlock } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { InitialsAvatar } from '@/components/common/initials-avatar';
import { FinishCelebration } from '@/components/workout/finish-celebration';
import { SessionPhotoStrip } from '@/components/workout/session-photo-strip';
import { WorkoutLogActionsSheet } from '@/components/workout/workout-log-actions-sheet';
import { ExerciseThumb } from '@/components/exercise/exercise-media';
import { MuscleBodyMap } from '@/components/progress/muscle-body-map';
import { useToast } from '@/components/ui/toast';
import {
  addWorkoutPhotos,
  deleteWorkoutPhoto,
  listWorkoutPhotos,
  createTemplateFromWorkoutLog,
  deleteWorkout,
  getPreviousTemplateVolume,
  getTemplateSuggestions,
  getWorkoutLog,
  getWorkoutMuscleSplit,
  getWorkoutPrs,
  type SessionSet,
  type MuscleSplit,
  type WorkoutPr,
} from '@/db/queries';
import { buildPostSessionInsights, postSessionInsights } from '@/coaching/insights';
import { buildFeaturePackV1 } from '@/coaching/feature-pack';
import { requestCoachNarration, type CoachNarration } from '@/coaching/narrate-client';
import { detectSetFatigue } from '@/coaching/fatigue';
import type { TrainingSuggestion } from '@/coaching/types';
import { useSettings } from '@/store/settings-store';
import { useShallow } from 'zustand/react/shallow';
import { useDbQuery, useProfile } from '@/hooks/use-data';
import { TABLES } from '@/lib/query-keys';
import { formatDuration, formatVolume, formatWeight, formatFullDateTime } from '@/db/calc';
import { formatCelebrationKinds } from '@/coaching/pr';
import { MUSCLE_LABELS } from '@/lib/labels';
import { workingSetVolume } from '@/lib/session-ghost';
import { SCREEN_CONTENT } from '@/lib/layout';
import type { MuscleDistribution, WorkoutPhoto } from '@/db/types';
import { resolveWeightUnit } from '@/lib/units';

const SUMMARY_TABLES = [...TABLES.coaching, 'exercise_images', 'workout_photos'] as const;
const NO_SPLIT: MuscleSplit[] = [];
const NO_PRS: WorkoutPr[] = [];
const NO_PHOTOS: WorkoutPhoto[] = [];
const NO_SUGGESTIONS: TrainingSuggestion[] = [];

export default function SummaryScreen() {
  const { id, celebrate } = useLocalSearchParams<{ id: string; celebrate?: string }>();
  const logId = Number(id);
  const showCelebration = celebrate === '1' || celebrate === 'true';
  const router = useRouter();
  const { toast } = useToast();
  const { unit, showRpe, exerciseWeightUnits } = useSettings(useShallow((s) => ({ unit: s.unit, showRpe: s.showRpe, exerciseWeightUnits: s.exerciseWeightUnits })));
  const { userId, getToken } = useAppAuth();
  const getTokenRef = useRef(getToken);
  const { data: profile } = useProfile();
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [narration, setNarration] = useState<CoachNarration | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  // One cached read keyed by the tables it touches: reopening paints
  // immediately, and the same references survive a revalidate, so the
  // narration effect below doesn't re-request on every focus.
  const { data: summary, loading } = useDbQuery(
    SUMMARY_TABLES,
    ['workoutSummary', logId, unit, exerciseWeightUnits],
    async () => {
      const [log, muscleSplit, prs, volumeDelta, photos] = await Promise.all([
        getWorkoutLog(logId),
        getWorkoutMuscleSplit(logId),
        getWorkoutPrs(logId),
        getPreviousTemplateVolume(logId),
        listWorkoutPhotos(logId),
      ]);
      const nextSuggestions = log?.templateId
        ? (await getTemplateSuggestions(log.templateId, unit, exerciseWeightUnits))
            .filter((x) => x.weight > 0)
            .slice(0, 3)
        : [];
      return { log, muscleSplit, prs, volumeDelta, photos, nextSuggestions };
    },
  );
  const log = summary?.log ?? null;
  const muscleSplit = summary?.muscleSplit ?? NO_SPLIT;
  const prs = summary?.prs ?? NO_PRS;
  const photos = summary?.photos ?? NO_PHOTOS;
  const volumeDelta = summary?.volumeDelta ?? null;
  const nextSuggestions = summary?.nextSuggestions ?? NO_SUGGESTIONS;

  const onAddPhotos = async (uris: string[]) => {
    try {
      await addWorkoutPhotos(logId, uris);
    } catch {
      toast({ title: 'Could not save photo', variant: 'destructive' });
    }
  };

  const onRemovePhoto = async (photoId: number) => {
    try {
      await deleteWorkoutPhoto(photoId);
    } catch {
      toast({ title: 'Could not remove photo', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (log && !log.isComplete) router.replace(`/session/${log.id}`);
  }, [log, router]);

  const breakdown = useMemo(() => {
    const map = new Map<number, { exerciseId: number; exerciseName: string; imageUrl: string | null; sets: SessionSet[] }>();
    for (const s of log?.sets ?? []) {
      if (!s.completed) continue;
      let b = map.get(s.exerciseId);
      if (!b) {
        b = { exerciseId: s.exerciseId, exerciseName: s.exerciseName, imageUrl: null, sets: [] };
        map.set(s.exerciseId, b);
      }
      b.sets.push(s);
    }
    return [...map.values()];
  }, [log]);

  const distribution: MuscleDistribution[] = useMemo(
    () => muscleSplit.map((s) => ({ muscle: s.muscle, sets: s.sets, volume: 0 })),
    [muscleSplit],
  );

  const coachingLines = useMemo(() => {
    let fatigueLine: string | null = null;
    if (log) {
      const byEx = new Map<number, SessionSet[]>();
      for (const s of log.sets) {
        const list = byEx.get(s.exerciseId) ?? [];
        list.push(s);
        byEx.set(s.exerciseId, list);
      }
      for (const sets of byEx.values()) {
        const cue = detectSetFatigue(sets, unit);
        if (cue) {
          fatigueLine = `${sets[0]?.exerciseName ?? 'An exercise'}: ${cue.title.toLowerCase()}.`;
          break;
        }
      }
    }
    return postSessionInsights({
      prCount: prs.length,
      volumeDeltaPct: volumeDelta?.deltaPct ?? null,
      suggestions: nextSuggestions.map((s) => ({
        exerciseName: s.exerciseName,
        reasonText: s.reasonText,
      })),
      fatigueLine,
    });
  }, [log, unit, prs.length, volumeDelta, nextSuggestions]);

  useEffect(() => {
    if (coachingLines.length === 0) {
      setNarration(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      let sessionFatigue: string | null = null;
      if (log) {
        const byEx = new Map<number, SessionSet[]>();
        for (const s of log.sets) {
          const list = byEx.get(s.exerciseId) ?? [];
          list.push(s);
          byEx.set(s.exerciseId, list);
        }
        for (const sets of byEx.values()) {
          const cue = detectSetFatigue(sets, unit);
          if (cue) {
            sessionFatigue = `${sets[0]?.exerciseName ?? 'An exercise'}: ${cue.title.toLowerCase()}.`;
            break;
          }
        }
      }
      const structured = buildPostSessionInsights({
        prCount: prs.length,
        volumeDeltaPct: volumeDelta?.deltaPct ?? null,
        suggestions: nextSuggestions.map((s) => ({
          exerciseName: s.exerciseName,
          reasonText: s.reasonText,
        })),
        fatigueLine: sessionFatigue,
      });
      const pack = buildFeaturePackV1({
        unit,
        surface: 'post_session',
        insights: structured.map((line) => ({
          id: line.id,
          kind: line.kind,
          severity: 'info',
          title: line.text.slice(0, 80),
          body: line.text,
        })),
        suggestions: nextSuggestions,
        aggregates: {
          prCount: prs.length,
          volumeDeltaPct: volumeDelta?.deltaPct ?? null,
        },
      });
      const result = await requestCoachNarration({
        surface: 'post_session',
        pack,
        getToken: (opts) => getTokenRef.current(opts),
        userId,
      });
      if (!cancelled) setNarration(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [coachingLines, log, unit, prs.length, volumeDelta, nextSuggestions, userId]);

  const athleteName = profile?.name?.trim() || 'Athlete';
  const volumeLabel = log ? formatVolume(workingSetVolume(log.sets), unit) : '';
  const completedSets = log?.sets.filter((s) => s.completed).length ?? 0;
  const totalSets = log?.sets.length ?? 0;

  const onSaveTemplate = async () => {
    if (savingTemplate) return;
    setSavingTemplate(true);
    try {
      const templateId = await createTemplateFromWorkoutLog(logId);
      toast({ title: 'Routine saved', description: 'Open it from Workouts anytime.', variant: 'success' });
      router.push(`/template/${templateId}` as Href);
    } catch (e) {
      toast({
        title: 'Could not save routine',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    }
    setSavingTemplate(false);
  };

  const onDeleteWorkout = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteWorkout(logId);
      setDeleteOpen(false);
      toast({ title: 'Workout deleted', variant: 'info' });
      if (router.canGoBack()) router.back();
      else router.replace('/(app)/(tabs)');
    } catch {
      toast({ title: 'Could not delete workout', variant: 'destructive' });
    }
    setDeleting(false);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <PrimaryActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!log) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background px-6">
        <Body className="text-center font-semibold text-foreground">Workout not found</Body>
        <Caption className="mt-2 text-center">This session may have been deleted.</Caption>
        <Button className="mt-4" onPress={() => router.replace('/(app)/(tabs)')}>Go home</Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <View className="items-center">
          <Body className="font-semibold text-foreground">{log.name}</Body>
          <Caption>{formatFullDateTime(log.startedAt)}</Caption>
        </View>
        <Pressable
          onPress={() => setMenuOpen(true)}
          className="p-1"
          accessibilityRole="button"
          accessibilityLabel="Workout options">
          <Icon icon={MoreHorizontal} size={22} color="foreground" />
        </Pressable>
      </View>

      <View className="px-4 pb-1">
        <SessionPhotoStrip photos={photos} onAdd={(uris) => void onAddPhotos(uris)} onRemove={(id) => void onRemovePhoto(id)} />
        {photos.length >= 2 ? (
          <Pressable
            onPress={() =>
              router.push(
                `/(app)/progress-photos?leftId=${photos[0].id}&rightId=${photos[photos.length - 1].id}` as Href,
              )
            }
            accessibilityRole="button"
            accessibilityLabel="Compare session photos"
            className="mb-1 self-end py-1">
            <Caption className="font-medium text-primary">Compare</Caption>
          </Pressable>
        ) : null}
      </View>

      {/* Same strip as the live session, so the summary reads as its end state. */}
      <View className="flex-row px-4 pb-3 pt-1">
        <StatBlock label="Duration" value={formatDuration(log.durationSeconds)} tone="primary" />
        <StatBlock
          label={`Volume · ${unit === 'metric' ? 'kg' : 'lb'}`}
          value={volumeLabel}
          sub={volumeDelta?.deltaPct != null ? `${volumeDelta.deltaPct > 0 ? '+' : ''}${volumeDelta.deltaPct}% vs last` : undefined}
        />
        <StatBlock label="Sets" value={`${completedSets}/${totalSets || completedSets}`} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ ...SCREEN_CONTENT, paddingTop: 4 }}>
        <View className="mb-4 flex-row items-center gap-3">
          <InitialsAvatar name={athleteName} uri={profile?.avatarUrl} size={40} />
          <View className="flex-1">
            <Body className="font-semibold text-foreground">{athleteName}</Body>
            <Caption>Completed session</Caption>
          </View>
          {prs.length > 0 ? (
            <View className="flex-row items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1">
              <Icon icon={Medal} size={14} color="warning" />
              <Caption className="font-medium text-foreground">{prs.length} PR{prs.length === 1 ? '' : 's'}</Caption>
            </View>
          ) : null}
        </View>

        <FinishCelebration active={showCelebration} prCount={prs.length} />

        {prs.length > 0 ? (
          <Section title="Records this session" first>
            <Card className="gap-3">
              {prs.map((pr) => (
                <View key={pr.exerciseId} className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Body className="font-medium text-foreground" numberOfLines={1}>
                      {pr.exerciseName}
                    </Body>
                    {pr.kinds?.length ? (
                      <Caption className="mt-0.5">{formatCelebrationKinds(pr.kinds, pr.reps)}</Caption>
                    ) : null}
                  </View>
                  <Body className="font-semibold tabular-nums text-primary">
                    {formatWeight(pr.weight, unit)} × {pr.reps}
                  </Body>
                </View>
              ))}
            </Card>
          </Section>
        ) : null}

        {coachingLines.length > 0 ? (
          <Section title="Next time" first={prs.length === 0}>
            <Card>
              {coachingLines.map((line, i) => (
                <Body key={line} className={i > 0 ? 'mt-2 text-sm text-foreground' : 'text-sm text-foreground'}>
                  {line}
                </Body>
              ))}
              {narration ? (
                <View className="mt-3 border-t border-border/60 pt-3">
                  <Caption className="font-medium text-foreground">{narration.headline}</Caption>
                  {narration.paragraphs.map((paragraph) => (
                    <Caption key={paragraph} className="mt-1">
                      {paragraph}
                    </Caption>
                  ))}
                </View>
              ) : null}
            </Card>
          </Section>
        ) : null}

        <Button
          variant="outline"
          className="mt-6"
          leftIcon={<Icon icon={Share2} size={16} color="primary" />}
          onPress={() => router.push(`/share/${logId}` as Href)}>
          Share workout
        </Button>

        {distribution.length > 0 ? (
          <Section title="Muscles trained">
            <Card>
              <MuscleBodyMap distribution={distribution} scale={0.95} />
              <View className="mt-3 gap-2">
                {muscleSplit.map((s) => (
                  <View key={s.muscle} className="flex-row items-center justify-between">
                    <Body className="text-sm text-foreground">{MUSCLE_LABELS[s.muscle]}</Body>
                    <Caption className="tabular-nums">
                      {s.sets} sets · {s.percentage}%
                    </Caption>
                  </View>
                ))}
              </View>
            </Card>
          </Section>
        ) : null}

        <Section
          title="Exercises"
          action={
            <Tappable
              onPress={() => router.push({ pathname: '/edit-workout/[id]', params: { id: String(logId) } } as Href)}
              pressedOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Edit workout"
              className="flex-row items-center gap-1">
              <Icon icon={PencilLine} size={14} color="primary" />
              <Caption className="font-medium text-primary">Edit</Caption>
            </Tappable>
          }>
        <View className="gap-6">
          {breakdown.length === 0 ? (
            <Caption>No completed sets in this session.</Caption>
          ) : (
            breakdown.map((b, i) => (
              <View key={b.exerciseId}>
                {i > 0 ? <View className="mb-6 h-px bg-border/40" /> : null}
                <Tappable
                  onPress={() => router.push(`/exercise/${b.exerciseId}`)}
                  pressedOpacity={0.6}
                  className="mb-2 flex-row items-center gap-3"
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${b.exerciseName} details`}>
                  <ExerciseThumb name={b.exerciseName} imageUrl={b.imageUrl} />
                  <Body className="flex-1 text-base font-semibold text-foreground">{b.exerciseName}</Body>
                  <Caption>{b.sets.length} sets</Caption>
                </Tappable>
                <View className="mb-1 flex-row items-center gap-3 px-1">
                  <Text className="w-10 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Set</Text>
                  <Text className="flex-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Weight × reps</Text>
                </View>
                {b.sets.map((s) => (
                  <View key={s.id} className="flex-row items-center gap-3 px-1 py-1.5">
                    <Caption className="w-10 font-medium">{s.setIndex + 1}</Caption>
                    <Body className="flex-1 text-sm tabular-nums text-foreground">
                      {s.weight > 0 ? `${formatWeight(s.weight, resolveWeightUnit(exerciseWeightUnits, s.exerciseRefKey, unit))} × ${s.reps}` : `${s.reps} reps`}
                      {showRpe && s.rpe != null ? ` · RPE ${s.rpe}` : ''}
                    </Body>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
        </Section>
      </ScrollView>

      <WorkoutLogActionsSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title={log.name}
        canSaveAsRoutine={completedSets > 0 && !savingTemplate}
        onEdit={() =>
          router.push({ pathname: '/edit-workout/[id]', params: { id: String(logId) } } as Href)
        }
        onSaveAsRoutine={onSaveTemplate}
        onDelete={() => setDeleteOpen(true)}
      />

      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete workout?"
        description="This workout will be permanently removed from your history."
        footer={
          <>
            <Button variant="outline" onPress={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onPress={onDeleteWorkout} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      />
    </SafeAreaView>
  );
}
