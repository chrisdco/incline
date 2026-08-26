import { useAuth } from '@clerk/clerk-expo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Medal, MoreHorizontal, PencilLine, Share2 } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Body, Caption } from '@/components/common/text';
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
  type SessionWorkout,
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
import { useProfile } from '@/hooks/use-data';
import { formatDuration, formatVolume, formatWeight, formatFullDateTime } from '@/db/calc';
import { formatCelebrationKinds } from '@/coaching/pr';
import { MUSCLE_LABELS } from '@/lib/labels';
import { SCREEN_CONTENT } from '@/lib/layout';
import type { MuscleDistribution, WorkoutPhoto } from '@/db/types';

export default function SummaryScreen() {
  const { id, celebrate } = useLocalSearchParams<{ id: string; celebrate?: string }>();
  const logId = Number(id);
  const showCelebration = celebrate === '1' || celebrate === 'true';
  const router = useRouter();
  const { toast } = useToast();
  const { unit } = useSettings();
  const { userId, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const { data: profile } = useProfile();
  const [log, setLog] = useState<SessionWorkout | null>(null);
  const [muscleSplit, setMuscleSplit] = useState<MuscleSplit[]>([]);
  const [prs, setPrs] = useState<WorkoutPr[]>([]);
  const [photos, setPhotos] = useState<WorkoutPhoto[]>([]);
  const [volumeDelta, setVolumeDelta] = useState<{ previousVolume: number; deltaPct: number | null } | null>(null);
  const [nextSuggestions, setNextSuggestions] = useState<TrainingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [narration, setNarration] = useState<CoachNarration | null>(null);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const reload = useCallback(async () => {
    const [s, split, prList, prevVol, photoList] = await Promise.all([
      getWorkoutLog(logId),
      getWorkoutMuscleSplit(logId),
      getWorkoutPrs(logId),
      getPreviousTemplateVolume(logId),
      listWorkoutPhotos(logId),
    ]);
    setLog(s);
    setMuscleSplit(split);
    setPrs(prList);
    setVolumeDelta(prevVol);
    setPhotos(photoList);
    if (s?.templateId) {
      const sug = await getTemplateSuggestions(s.templateId, unit);
      setNextSuggestions(sug.filter((x) => x.weight > 0).slice(0, 3));
    } else {
      setNextSuggestions([]);
    }
    setLoading(false);
  }, [logId, unit]);

  const onAddPhotos = async (uris: string[]) => {
    try {
      const next = await addWorkoutPhotos(logId, uris);
      setPhotos(next);
    } catch {
      toast({ title: 'Could not save photo', variant: 'destructive' });
    }
  };

  const onRemovePhoto = async (photoId: number) => {
    try {
      await deleteWorkoutPhoto(photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch {
      toast({ title: 'Could not remove photo', variant: 'destructive' });
    }
  };

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

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
  const volumeLabel = log ? formatVolume(log.totalVolume, unit) : '';
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
    } finally {
      setSavingTemplate(false);
    }
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
    } finally {
      setDeleting(false);
    }
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

      {/* Session-style stats strip */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <View className="flex-1 items-center">
          <Caption>Duration</Caption>
          <Body className="mt-0.5 font-semibold text-primary">{formatDuration(log.durationSeconds)}</Body>
        </View>
        <View className="flex-1 items-center">
          <Caption>Volume · {unit === 'metric' ? 'kg' : 'lb'}</Caption>
          <Body className="mt-0.5 font-semibold text-foreground">{volumeLabel}</Body>
        </View>
        <View className="flex-1 items-center">
          <Caption>Sets</Caption>
          <Body className="mt-0.5 font-semibold text-foreground">
            {completedSets}/{totalSets || completedSets}
          </Body>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ ...SCREEN_CONTENT, paddingTop: 4 }}>
        <View className="mb-3 flex-row items-center gap-3">
          <InitialsAvatar name={athleteName} uri={profile?.avatarUrl} size={40} />
          <View className="flex-1">
            <Body className="font-semibold text-foreground">{athleteName}</Body>
            {volumeDelta?.deltaPct != null ? (
              <Caption>
                vs last {log.name}: {volumeDelta.deltaPct > 0 ? '+' : ''}
                {volumeDelta.deltaPct}% volume
              </Caption>
            ) : (
              <Caption>Completed session</Caption>
            )}
          </View>
          {prs.length > 0 ? (
            <View className="flex-row items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1">
              <Icon icon={Medal} size={14} color="warning" />
              <Caption className="font-medium text-foreground">{prs.length} PR{prs.length === 1 ? '' : 's'}</Caption>
            </View>
          ) : null}
        </View>

        <FinishCelebration active={showCelebration} prCount={prs.length} />

        {coachingLines.length > 0 ? (
          <View className="mb-4 rounded-2xl bg-card p-3">
            <Caption className="mb-2 font-semibold text-foreground">Next time</Caption>
            {coachingLines.map((line) => (
              <Body key={line} className="mt-1 text-sm text-foreground">
                {line}
              </Body>
            ))}
            {narration ? (
              <View className="mt-3 border-t border-border/60 pt-3">
                <Caption className="font-medium text-muted-foreground">{narration.headline}</Caption>
                {narration.paragraphs.map((paragraph) => (
                  <Caption key={paragraph} className="mt-1 text-muted-foreground">
                    {paragraph}
                  </Caption>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <Button
          variant="outline"
          className="mb-4"
          leftIcon={<Icon icon={Share2} size={16} color="primary" />}
          onPress={() => router.push(`/share/${logId}` as Href)}>
          Share workout
        </Button>

        {prs.length > 0 ? (
          <View className="mb-4 rounded-2xl bg-card p-3">
            <Caption className="mb-2 font-semibold text-foreground">Records this session</Caption>
            <View className="gap-2">
              {prs.map((pr) => (
                <View key={pr.exerciseId} className="flex-row items-center justify-between gap-3">
                  <View className="flex-1">
                    <Body className="text-sm text-foreground" numberOfLines={1}>
                      {pr.exerciseName}
                    </Body>
                    {pr.kinds?.length ? (
                      <Caption>{formatCelebrationKinds(pr.kinds, pr.reps)}</Caption>
                    ) : null}
                  </View>
                  <Caption className="font-medium text-primary">
                    {formatWeight(pr.weight, unit)} × {pr.reps}
                  </Caption>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {distribution.length > 0 ? (
          <View className="mb-4 rounded-3xl bg-card px-3 py-3">
            <Caption className="mb-2 font-semibold text-foreground">Muscles trained</Caption>
            <MuscleBodyMap distribution={distribution} scale={0.95} />
            <View className="mt-2 gap-1.5">
              {muscleSplit.map((s) => (
                <View key={s.muscle} className="flex-row items-center justify-between">
                  <Body className="text-sm text-foreground">{MUSCLE_LABELS[s.muscle]}</Body>
                  <Caption>
                    {s.sets} sets · {s.percentage}%
                  </Caption>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View className="mb-3 flex-row items-center justify-between">
          <Caption className="text-base font-semibold text-foreground">Workout</Caption>
          <Pressable
            onPress={() => router.push({ pathname: '/edit-workout/[id]', params: { id: String(logId) } } as Href)}
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
            className="flex-row items-center gap-1">
            <Icon icon={PencilLine} size={14} color="primary" />
            <Caption className="font-medium text-primary">Edit</Caption>
          </Pressable>
        </View>

        <View className="gap-5">
          {breakdown.length === 0 ? (
            <Caption>No completed sets in this session.</Caption>
          ) : (
            breakdown.map((b, i) => (
              <View key={b.exerciseId}>
                {i > 0 ? <View className="mb-5 h-px bg-border/40" /> : null}
                <Pressable
                  onPress={() => router.push(`/exercise/${b.exerciseId}`)}
                  style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                  className="mb-2 flex-row items-center gap-3"
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${b.exerciseName} details`}>
                  <ExerciseThumb name={b.exerciseName} imageUrl={b.imageUrl} />
                  <Body className="flex-1 text-base font-semibold text-foreground">{b.exerciseName}</Body>
                  <Caption>{b.sets.length} sets</Caption>
                </Pressable>
                <View className="mb-1 flex-row items-center gap-3 px-1">
                  <Caption className="w-10">SET</Caption>
                  <Caption className="flex-1">WEIGHT & REPS</Caption>
                </View>
                {b.sets.map((s) => (
                  <View key={s.id} className="flex-row items-center gap-3 px-1 py-1.5">
                    <Caption className="w-10 font-medium">{s.setIndex + 1}</Caption>
                    <Body className="flex-1 text-sm text-foreground">
                      {s.weight > 0 ? `${formatWeight(s.weight, unit)} × ${s.reps}` : `${s.reps} reps`}
                      {s.rpe != null ? ` · RPE ${s.rpe}` : ''}
                    </Body>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>
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
