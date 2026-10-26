import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  TextInput,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
  type ViewInstance,
} from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, MessageSquarePlus, Pause, Play, Plus, X } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Body, Caption } from '@/components/common/text';
import { ListSkeleton } from '@/components/common/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Sheet } from '@/components/ui/sheet';
import { ExerciseBlock } from '@/components/workout/exercise-block';
import { DiscardSessionDialog } from '@/components/workout/discard-session-dialog';
import { RestTimerBar } from '@/components/workout/rest-timer';
import { RestPresetBar } from '@/components/workout/rest-preset-bar';
import { SessionDock } from '@/components/workout/session-dock';
import { useRestTimer } from '@/hooks/use-rest-timer';
import { useRestTimerSound } from '@/hooks/use-rest-timer-sound';
import { useHaptics } from '@/hooks/use-haptics';
import { useActiveWorkout } from '@/store/active-workout-store';
import { useSettings } from '@/store/settings-store';
import { useToast } from '@/components/ui/toast';
import { formatClock, formatVolume } from '@/db/calc';
import { workingSetVolume } from '@/lib/session-ghost';
import { dropCachedSession, getCachedSession, setCachedSession } from '@/lib/query-keys';
import { finishBlock, pausedMsAt, sessionEngine, useSessionEngine } from '@/features/session';
import { SCREEN_CONTENT_CTA } from '@/lib/layout';
import { motionDuration } from '@/styles/motion';
import { PLACEHOLDER_COLOR } from '@/constants/config';
import { METRIC_ICONS } from '@/lib/metric-icons';
import { MuscleBodyMap } from '@/components/progress/muscle-body-map';

import type { MuscleGroup, SetEntry } from '@/db/types';

interface Group {
  exerciseId: number;
  exerciseName: string;
  sets: SetEntry[];
  supersetGroup: number | null;
}

/**
 * Elapsed workout clock. Isolated so the 1s tick re-renders only this text,
 * not the whole session (every set row + input) underneath it. Pause state
 * comes from the session engine (persisted, so a relaunch keeps it).
 */
function SessionClock({ startedAt, className }: { startedAt: number; className?: string }) {
  const pausedAt = useSessionEngine((s) => s.pausedAt);
  const totalPausedMs = useSessionEngine((s) => s.totalPausedMs);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      setElapsed(Math.floor((now - startedAt - pausedMsAt({ pausedAt, totalPausedMs }, now)) / 1000));
    };
    tick();
    if (pausedAt != null) return;
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [startedAt, pausedAt, totalPausedMs]);
  return <Body className={className}>{formatClock(elapsed)}</Body>;
}

const engine = sessionEngine;
const EMPTY: Record<number, never> = {};

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const logId = Number(id);
  const router = useRouter();
  const { toast } = useToast();
  const { impact, notify } = useHaptics();
  const clear = useActiveWorkout((s) => s.clear);
  const { unit, setUnit, restSoundEnabled, keepScreenAwake, showWarmUpSets, showRpe, showSessionGhost } = useSettings();
  const rest = useRestTimer({ notify: restSoundEnabled, sessionId: logId });
  const restSound = useRestTimerSound();

  // Until open() claims this id (first effect), paint the reopen cache (§7)
  // and none of a previous session's assist state.
  const [initialCached] = useState(() => getCachedSession(logId));
  const owns = useSessionEngine((s) => s.logId === logId);
  const engineSession = useSessionEngine((s) => s.session);
  const engineLoading = useSessionEngine((s) => s.loading && s.session == null);
  const session = owns ? engineSession : initialCached;
  const loading = owns ? engineLoading : initialCached == null;
  const lastSetsMap = useSessionEngine((s) => (s.logId === logId ? s.lastSets : EMPTY));
  const prMap = useSessionEngine((s) => (s.logId === logId ? s.prs : EMPTY));
  const suggestionMap = useSessionEngine((s) => (s.logId === logId ? s.suggestions : EMPTY));
  const ghost = useSessionEngine((s) => (s.logId === logId ? s.ghost : null));
  const restSecondsMap = useSessionEngine((s) => (s.logId === logId ? s.restSeconds : EMPTY));
  const restKind = useSessionEngine((s) => s.restKind);
  const pausedAt = useSessionEngine((s) => s.pausedAt);
  const notes = useSessionEngine((s) => s.notesDraft);
  const finishing = useSessionEngine((s) => s.finishing);
  const discarding = useSessionEngine((s) => s.discarding);

  const scrollRef = useRef<ScrollViewInstance>(null);
  const groupRefs = useRef<(ViewInstance | null)[]>([]);
  const prevActiveGroupRef = useRef<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ exerciseId: number; name: string } | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const notesRef = useRef<TextInputInstance>(null);
  const [timerSheetOpen, setTimerSheetOpen] = useState(false);

  // Keep-awake follows pause: no point holding the screen on while paused.
  useEffect(() => {
    if (!keepScreenAwake || pausedAt !== null) return;
    void activateKeepAwakeAsync('incline-session');
    return () => {
      void deactivateKeepAwake('incline-session');
    };
  }, [keepScreenAwake, pausedAt]);

  // Play sound when rest timer finishes
  useEffect(() => {
    if (rest.justFinished && restSoundEnabled) restSound.play();
  }, [rest.justFinished, restSound, restSoundEnabled]);

  // UI side effects the engine fires (toast, rest, PR haptic).
  const startRest = rest.start;
  const stopRest = rest.stop;
  useEffect(
    () =>
      engine.bindUi({
        toast,
        startRest: (seconds) => {
          startRest(seconds);
        },
        stopRest,
        celebrate: notify,
      }),
    [toast, startRest, stopRest, notify],
  );

  // Stale-while-revalidate: cached rows paint synchronously (§7) while the
  // engine refreshes from SQLite. A different id fully resets inside open().
  useEffect(() => {
    void engine.open(logId, initialCached);
  }, [logId, initialCached]);

  // Pick/reorder screens write directly then go back: refresh rows, plus
  // assist and rest defaults for exercises the engine hasn't seen (#157).
  useFocusEffect(
    useCallback(() => {
      if (engine.store.getState().logId === logId) void engine.refresh();
      // Leaving the screen commits the notes draft (#170).
      return () => {
        void engine.commitNotes();
      };
    }, [logId]),
  );

  // Keep the reopen cache fresh on every state change.
  useEffect(() => {
    if (session) setCachedSession(session);
  }, [session]);

  useEffect(() => {
    if (session?.isComplete && !finishing) router.replace(`/summary/${session.id}`);
  }, [session?.isComplete, session?.id, router, finishing]);

  const groups: Group[] = [];
  for (const s of session?.sets ?? []) {
    let g = groups.find((x) => x.exerciseId === s.exerciseId);
    if (!g) {
      g = {
        exerciseId: s.exerciseId,
        exerciseName: s.exerciseName,
        sets: [],
        supersetGroup: s.supersetGroup ?? null,
      };
      groups.push(g);
    }
    g.sets.push(s);
  }

  // The exercise the user should be working on: first group that still has an
  // unfinished set, else the last group.
  const activeGroupIndex = (() => {
    if (groups.length === 0) return -1;
    const idx = groups.findIndex((g) => g.sets.some((s) => !s.completed));
    return idx === -1 ? groups.length - 1 : idx;
  })();

  // Auto-scroll to the current exercise when the active group advances.
  useEffect(() => {
    if (loading || !session || activeGroupIndex < 0) return;
    if (prevActiveGroupRef.current === activeGroupIndex) return;
    prevActiveGroupRef.current = activeGroupIndex;
    const t = setTimeout(() => {
      const target = groupRefs.current[activeGroupIndex];
      const scroller = scrollRef.current;
      const node = scroller?.getNativeScrollRef?.();
      if (!target || !scroller || !node) return;
      target.measureLayout(
        node,
        (x, y) => scroller.scrollTo({ y: Math.max(0, y - 140), animated: true }),
        () => {},
      );
    }, 120);
    return () => clearTimeout(t);
  }, [session, activeGroupIndex, loading]);

  // Id-keyed handlers: stable references, so an ExerciseBlock only re-renders
  // when its own data changes. Completion haptics live in SetRow.
  const onAddSet = useCallback((exerciseId: number) => {
    impact();
    void engine.addSet(exerciseId);
  }, [impact]);
  const onAddWarmUp = useCallback((exerciseId: number) => {
    impact();
    void engine.addWarmUp(exerciseId);
  }, [impact]);
  const onApplyLoad = useCallback((exerciseId: number, weight: number, reps?: number) => {
    impact();
    void engine.applyLoad(exerciseId, weight, reps);
  }, [impact]);
  const openExercise = useCallback((exerciseId: number) => {
    router.push(`/exercise/${exerciseId}` as Href);
  }, [router]);
  const openAddExercise = () => {
    router.push(`/pick-exercise?logId=${logId}&mode=add` as Href);
  };
  const openReplaceExercise = useCallback((exerciseId: number, name: string) => {
    const logged =
      engine.store.getState().session?.sets.filter((s) => s.exerciseId === exerciseId && s.completed).length ?? 0;
    const params = new URLSearchParams({
      logId: String(logId),
      mode: 'replace',
      exerciseId: String(exerciseId),
      name,
      logged: String(logged),
    });
    router.push(`/pick-exercise?${params.toString()}` as Href);
  }, [logId, router]);
  const openReorder = useCallback(() => {
    router.push(`/session/reorder/${logId}` as Href);
  }, [logId, router]);
  const askRemoveExercise = useCallback((exerciseId: number, name: string) => {
    setRemoveTarget({ exerciseId, name });
  }, []);
  const removeTargetExercise = () => {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    impact();
    void engine.removeExercise(target.exerciseId, target.name);
  };

  const finish = async () => {
    setFinishOpen(false);
    const ok = await engine.finish();
    if (!ok) return;
    clear();
    dropCachedSession(logId);
    router.replace(`/summary/${logId}?celebrate=1`);
  };
  const discard = async () => {
    setDiscardOpen(false);
    const ok = await engine.discard();
    if (!ok) return;
    clear();
    dropCachedSession(logId);
    router.replace('/(app)/(tabs)');
  };

  if (loading)
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
        <View className="px-4 pb-2 pt-3">
          <View className="h-6 w-40 rounded-lg bg-muted" />
        </View>
        <View className="px-4">
          <ListSkeleton count={4} />
        </View>
      </SafeAreaView>
    );
  if (!session) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background px-6">
        <Body className="text-center font-semibold text-foreground">Workout not found</Body>
        <Caption className="mt-2 text-center">This session may have been discarded.</Caption>
        <Button className="mt-4" onPress={() => router.replace('/(app)/(tabs)')}>Go home</Button>
      </SafeAreaView>
    );
  }

  const completedSets = session.sets.filter((s) => s.completed).length;
  const totalSets = session.sets.length;
  const block = finishBlock(session);
  // Working-only live total: matches the ghost + progress definition so a
  // warm-up can never inflate the number mid-session.
  const totalVolume = workingSetVolume(session.sets);

  // Completed sets only: an unstarted exercise must not paint its muscle as
  // trained on the body map.
  const sessionMuscleDistribution = (() => {
    const counts: Partial<Record<MuscleGroup, number>> = {};
    for (const s of session.sets) {
      if (!s.completed) continue;
      counts[s.primaryMuscle] = (counts[s.primaryMuscle] ?? 0) + 1;
    }
    return (Object.entries(counts) as [MuscleGroup, number][]).map(([muscle, sets]) => ({
      muscle,
      sets,
      volume: 0,
    }));
  })();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <Pressable accessibilityRole="button" accessibilityLabel="Discard workout" onPress={() => setDiscardOpen(true)} className="p-1">
          <Icon icon={X} size={24} color="muted-foreground" />
        </Pressable>
        <View className="items-center">
          <Body className="font-semibold text-foreground">{session.name}</Body>
          {pausedAt ? <Caption className="text-amber-500">Paused</Caption> : null}
        </View>
        <Button size="sm" variant="success" leftIcon={<Icon icon={Check} size={16} color="success-foreground" />} onPress={() => setFinishOpen(true)} disabled={finishing || discarding} loading={finishing}>
          Finish
        </Button>
      </View>

      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable
          onPress={() => setTimerSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Workout timer"
          className="flex-1 items-center">
          <Caption>Duration</Caption>
          <SessionClock startedAt={session.startedAt} className="mt-0.5 font-semibold text-primary" />
          {pausedAt ? (
            <Caption className="mt-0.5 text-amber-500">Paused</Caption>
          ) : null}
          {ghost && showSessionGhost ? (
            <Caption className="mt-0.5">Last time {formatClock(ghost.durationSeconds)}</Caption>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => {
            const next = unit === 'metric' ? 'imperial' : 'metric';
            setUnit(next);
            toast({ title: `Units: ${next === 'metric' ? 'kg' : 'lb'}`, description: 'Weight display updated for this workout.' });
          }}
          accessibilityRole="button"
          accessibilityLabel={`Toggle units, currently ${unit === 'metric' ? 'kg' : 'lb'}`}
          className="flex-1 items-center">
          <Caption>Volume · {unit === 'metric' ? 'kg' : 'lb'}</Caption>
          <Body className="mt-0.5 font-semibold text-foreground">{formatVolume(totalVolume, unit)}</Body>
          {ghost && showSessionGhost ? (
            <Caption className="mt-0.5">Last time {formatVolume(ghost.workingVolume, unit)}</Caption>
          ) : null}
        </Pressable>
        <View className="flex-1 items-center">
          <Caption>Sets</Caption>
          <Body className="mt-0.5 font-semibold text-foreground">{completedSets}/{totalSets}</Body>
          {ghost && showSessionGhost ? (
            <Caption className="mt-0.5">Last time {ghost.workingSetCount}</Caption>
          ) : null}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ ...SCREEN_CONTENT_CTA, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets>
        {sessionMuscleDistribution.length > 0 ? (
          <View className="mb-3 items-center rounded-3xl bg-card py-2">
            <MuscleBodyMap distribution={sessionMuscleDistribution} compact scale={0.72} />
          </View>
        ) : null}

        <Button variant="outline" className="mb-3" leftIcon={<Icon icon={Plus} size={16} color="primary" />} onPress={openAddExercise}>
          Add exercise
        </Button>

        {groups.length === 0 ? (
          <View className="items-center py-16">
            <Body className="font-semibold text-foreground">No exercises yet</Body>
            <Caption className="mt-1 text-center">Add an exercise to start logging sets.</Caption>
          </View>
        ) : (
          <View className="gap-5">
            {groups.map((g, i) => {
              const prev = i > 0 ? groups[i - 1] : null;
              const inSuperset = g.supersetGroup != null;
              const continueSuperset =
                inSuperset && prev != null && prev.supersetGroup === g.supersetGroup;
              return (
              // Layout-animated: note editors expanding in one block glide the
              // blocks below instead of snapping them.
              <Animated.View
                key={g.exerciseId}
                layout={LinearTransition.duration(motionDuration.enter)}>
              <View
                ref={(el) => { groupRefs.current[i] = el; }}
                className={inSuperset ? 'border-l-2 border-primary/50 pl-3' : undefined}>
                {i > 0 && !continueSuperset ? <View className="mb-5 h-px bg-border/40" /> : null}
                {continueSuperset ? (
                  <Caption className="mb-2 text-primary">Superset</Caption>
                ) : inSuperset && (!prev || prev.supersetGroup !== g.supersetGroup) ? (
                  <Caption className="mb-2 text-primary">Superset</Caption>
                ) : null}
                <ExerciseBlock
                  logId={logId}
                  name={g.exerciseName}
                  exerciseId={g.exerciseId}
                  sets={g.sets}
                  unit={unit}
                  lastSets={lastSetsMap[g.exerciseId] ?? []}
                  prSummary={prMap[g.exerciseId] ?? null}
                  restSeconds={restSecondsMap[g.exerciseId] ?? 0}
                  onChangeRestSeconds={engine.setRest}
                  onChangeWeight={engine.changeWeight}
                  onChangeReps={engine.changeReps}
                  onToggleComplete={engine.toggleComplete}
                  onRemoveSet={engine.removeSet}
                  onAddSet={onAddSet}
                  onAddWarmUp={onAddWarmUp}
                  onApplyLoad={onApplyLoad}
                  onChangeRpe={engine.changeRpe}
                  onChangeSetType={engine.changeSetType}
                  onOpenExercise={openExercise}
                  onReplaceExercise={openReplaceExercise}
                  onRemoveExercise={askRemoveExercise}
                  onReorderExercises={openReorder}
                  showWarmUpSets={showWarmUpSets}
                  showRpe={showRpe}
                  loadSuggestion={suggestionMap[g.exerciseId] ?? null}
                />
              </View>
              </Animated.View>
            );})}
          </View>
        )}

        {session.sets.length > 0 ? (
          <View className="mt-5 mb-3 rounded-2xl bg-card p-3">
            <Caption className="mb-2 text-muted-foreground">Set rest for all exercises</Caption>
            <RestPresetBar onSelect={engine.setRestForAll} />
          </View>
        ) : null}

        <Pressable
          onPress={() => {
            // Collapsing commits the draft, same as blur (#170).
            if (notesOpen) void engine.commitNotes();
            setNotesOpen(!notesOpen);
          }}
          className="mb-3 flex-row items-center gap-2 rounded-xl bg-card px-4 py-3">
          <Icon icon={MessageSquarePlus} size={16} color="primary" />
          <Body className="text-sm text-foreground">{notesOpen ? 'Hide notes' : notes ? 'Show notes' : 'Add notes'}</Body>
        </Pressable>

        {notesOpen && (
          <View className="mb-4 rounded-xl bg-card p-4">
            <Caption className="mb-2">Workout notes</Caption>
            <TextInput
              ref={notesRef}
              value={notes}
              onChangeText={engine.setNotesDraft}
              onBlur={() => { void engine.commitNotes(); }}
              placeholder="How did this session feel?"
              placeholderTextColor={PLACEHOLDER_COLOR}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              className="rounded-xl bg-background p-3 text-foreground"
              style={{ minHeight: 80, fontSize: 14, lineHeight: 20 }}
            />
          </View>
        )}

        <Pressable
          onPress={() => router.push('/(app)/plate-calculator' as Href)}
          className="mb-3 flex-row items-center gap-2 rounded-xl bg-card px-4 py-3">
          <Icon icon={METRIC_ICONS.equipment} size={16} color="primary" />
          <Body className="text-sm text-foreground">Plate calculator</Body>
        </Pressable>

        {groups.length > 0 ? (
          <Button variant="outline" className="mb-3" leftIcon={<Icon icon={Plus} size={16} color="primary" />} onPress={openAddExercise}>
            Add exercise
          </Button>
        ) : null}
      </ScrollView>

      <SessionDock>
        {rest.visible ? (
          <RestTimerBar
            docked
            caption={restKind === 'superset' ? 'Superset rest' : undefined}
            onAdd={rest.add}
            onSkip={rest.stop}
          />
        ) : null}
      </SessionDock>

      <Dialog
        open={removeTarget != null}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        title={removeTarget ? `Remove ${removeTarget.name}?` : 'Remove exercise?'}
        description="Its sets leave this session. Your routine is untouched — finishing saves what you actually did as history."
        footer={
          <>
            <Button variant="outline" onPress={() => setRemoveTarget(null)}>Keep</Button>
            <Button variant="destructive" onPress={removeTargetExercise}>Remove</Button>
          </>
        }
      />

      <Dialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        title="Finish workout?"
        description={
          block
            ? block.message
            : completedSets < totalSets
              ? `You completed ${completedSets} of ${totalSets} sets — ${totalSets - completedSets} still open. Save this session to your history?`
              : `You completed ${completedSets} of ${totalSets} sets. Save this session to your history.`
        }
        footer={
          <>
            <Button variant="outline" onPress={() => setFinishOpen(false)} disabled={finishing}>Keep logging</Button>
            <Button variant="success" onPress={() => { void finish(); }} disabled={finishing || block != null} loading={finishing}>Finish &amp; save</Button>
          </>
        }
      />
      <DiscardSessionDialog open={discardOpen} onOpenChange={(open) => { if (!discarding) setDiscardOpen(open); }} onConfirm={() => { void discard(); }} pending={discarding} />

      <Sheet open={timerSheetOpen} onOpenChange={setTimerSheetOpen} title="Workout Timer" mode="fit">
        <View className="items-center gap-3 py-2">
          <Body className="text-sm text-muted-foreground">Elapsed time</Body>
          <SessionClock startedAt={session.startedAt} className="text-5xl font-bold tracking-tight text-foreground" />
          {pausedAt ? (
            <Caption className="text-amber-500">Paused</Caption>
          ) : null}
          <View className="mt-1 flex-row gap-3">
            {pausedAt ? (
              <Button
                size="lg"
                leftIcon={<Icon icon={Play} size={18} color="success-foreground" />}
                variant="success"
                onPress={() => {
                  engine.resume();
                  impact();
                }}>
                Resume
              </Button>
            ) : (
              <Button
                size="lg"
                leftIcon={<Icon icon={Pause} size={18} color="primary-foreground" />}
                onPress={() => {
                  engine.pause();
                  impact();
                }}>
                Pause
              </Button>
            )}
          </View>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
