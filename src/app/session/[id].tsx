import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
import { Check, MessageSquarePlus, Pause, Play, Plus, Timer, X } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Body, Caption } from '@/components/common/text';
import { ListSkeleton } from '@/components/common/skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ListRow, Section, StatBlock } from '@/components/layout';
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
import { useShallow } from 'zustand/react/shallow';
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

import type { MuscleGroup, SetEntry, Unit } from '@/db/types';
import { resolveWeightUnit } from '@/lib/units';

interface Group {
  exerciseId: number;
  exerciseName: string;
  /** Cross-device key; resolves this exercise's display unit. */
  refKey: string | null;
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

/** Body map of completed sets; memoized on the `muscle:count|…` key. */
const SessionMuscleMap = memo(function SessionMuscleMap({ muscleKey }: { muscleKey: string }) {
  const distribution = muscleKey.split('|').map((part) => {
    const [muscle, sets] = part.split(':');
    return { muscle: muscle as MuscleGroup, sets: Number(sets), volume: 0 };
  });
  return (
    <Card className="items-center py-2">
      <MuscleBodyMap distribution={distribution} compact scale={0.72} />
    </Card>
  );
});

const engine = sessionEngine;
const EMPTY: Record<number, never> = {};

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const logId = Number(id);
  const router = useRouter();
  const { toast } = useToast();
  const { impact, notify } = useHaptics();
  const clear = useActiveWorkout((s) => s.clear);
  const { unit, restSoundEnabled, keepScreenAwake, showWarmUpSets, showRpe, showSessionGhost, exerciseWeightUnits, setExerciseWeightUnit } = useSettings(useShallow((s) => ({ unit: s.unit, restSoundEnabled: s.restSoundEnabled, keepScreenAwake: s.keepScreenAwake, showWarmUpSets: s.showWarmUpSets, showRpe: s.showRpe, showSessionGhost: s.showSessionGhost, exerciseWeightUnits: s.exerciseWeightUnits, setExerciseWeightUnit: s.setExerciseWeightUnit })));
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
        refKey: s.exerciseRefKey,
        sets: [],
        supersetGroup: s.supersetGroup ?? null,
      };
      groups.push(g);
    }
    g.sets.push(s);
  }

  // Per-exercise display unit. Picking the global unit clears the override,
  // so the exercise follows future global changes again. Display only —
  // stored weights are kg, so nothing is rewritten (§15).
  const changeExerciseUnit = (exerciseId: number, next: Unit) => {
    const refKey = groups.find((x) => x.exerciseId === exerciseId)?.refKey;
    if (!refKey) {
      toast({ title: 'This exercise can’t have its own unit yet', variant: 'warning' });
      return;
    }
    setExerciseWeightUnit(refKey, next === unit ? null : next);
  };

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
          <View className="h-6 w-40 rounded-xl bg-muted" />
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
  // trained. A string key keeps the SVG map from redrawing on edits that
  // don't change any muscle's completed-set count (weight/reps typing).
  const muscleCounts: Partial<Record<MuscleGroup, number>> = {};
  for (const s of session.sets) {
    if (s.completed) muscleCounts[s.primaryMuscle] = (muscleCounts[s.primaryMuscle] ?? 0) + 1;
  }
  const muscleKey = (Object.entries(muscleCounts) as [MuscleGroup, number][])
    .map(([m, n]) => `${m}:${n}`)
    .join('|');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <Pressable accessibilityRole="button" accessibilityLabel="Discard workout" onPress={() => setDiscardOpen(true)} className="p-1">
          <Icon icon={X} size={24} color="muted-foreground" />
        </Pressable>
        <Body numberOfLines={1} className="mx-3 flex-1 text-center font-semibold text-foreground">{session.name}</Body>
        <Button size="sm" variant="success" leftIcon={<Icon icon={Check} size={16} color="success-foreground" />} onPress={() => setFinishOpen(true)} disabled={finishing || discarding} loading={finishing}>
          Finish
        </Button>
      </View>

      {/* Stats strip: the three numbers a lifter glances at between sets.
          Values carry the weight; labels and "last time" stay quiet. */}
      <View className="flex-row px-4 pb-3 pt-1">
        <Pressable
          onPress={() => setTimerSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Workout timer. Activate to pause or resume."
          className="flex-1">
          <StatBlock
            label={pausedAt ? 'Paused' : 'Duration'}
            value={<SessionClock startedAt={session.startedAt} className={pausedAt ? 'text-lg font-semibold text-foreground' : 'text-lg font-semibold text-primary'} />}
            tone={pausedAt ? 'default' : 'primary'}
            sub={ghost && showSessionGhost ? `Last ${formatClock(ghost.durationSeconds)}` : undefined}
          />
        </Pressable>
        <StatBlock
          label={`Volume · ${unit === 'metric' ? 'kg' : 'lb'}`}
          value={formatVolume(totalVolume, unit)}
          sub={ghost && showSessionGhost ? `Last ${formatVolume(ghost.workingVolume, unit)}` : undefined}
        />
        <StatBlock
          label="Sets"
          value={`${completedSets}/${totalSets}`}
          sub={ghost && showSessionGhost ? `Last ${ghost.workingSetCount}` : undefined}
        />
      </View>
      <Progress value={totalSets > 0 ? (completedSets / totalSets) * 100 : 0} className="mx-4 mb-1 h-1" />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ ...SCREEN_CONTENT_CTA, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets>
        {groups.length === 0 ? (
          <View className="items-center py-16">
            <Body className="font-semibold text-foreground">No exercises yet</Body>
            <Caption className="mb-4 mt-1 text-center">Add an exercise to start logging sets.</Caption>
            <Button leftIcon={<Icon icon={Plus} size={16} color="primary-foreground" />} onPress={openAddExercise}>
              Add exercise
            </Button>
          </View>
        ) : (
          <View className="gap-6 pt-3">
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
                {i > 0 && !continueSuperset ? <View className="mb-6 h-px bg-border/40" /> : null}
                {inSuperset ? <Caption className="mb-2 text-primary">Superset</Caption> : null}
                <ExerciseBlock
                  logId={logId}
                  name={g.exerciseName}
                  exerciseId={g.exerciseId}
                  sets={g.sets}
                  unit={resolveWeightUnit(exerciseWeightUnits, g.refKey, unit)}
                  onChangeUnit={changeExerciseUnit}
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

        {groups.length > 0 ? (
          <Button variant="outline" className="mt-6" leftIcon={<Icon icon={Plus} size={16} color="primary" />} onPress={openAddExercise}>
            Add exercise
          </Button>
        ) : null}

        {/* Everything that is not logging a set sits below the exercises,
            grouped, so the set list stays the first thing on screen. */}
        {session.sets.length > 0 ? (
          <Section title="Workout">
            <Card className="py-1">
              <ListRow
                icon={<Icon icon={MessageSquarePlus} size={18} color="muted-foreground" />}
                title="Notes"
                subtitle={notes && !notesOpen ? notes : 'How did this session feel?'}
                onPress={() => {
                  // Collapsing commits the draft, same as blur (#170).
                  if (notesOpen) void engine.commitNotes();
                  setNotesOpen(!notesOpen);
                }}
                accessibilityLabel={notesOpen ? 'Hide notes' : 'Edit notes'}>
                <Caption className="text-primary">{notesOpen ? 'Done' : notes ? 'Edit' : 'Add'}</Caption>
              </ListRow>
              {notesOpen ? (
                <TextInput
                  ref={notesRef}
                  value={notes}
                  onChangeText={engine.setNotesDraft}
                  onBlur={() => { void engine.commitNotes(); }}
                  placeholder="How did this session feel?"
                  placeholderTextColor={PLACEHOLDER_COLOR}
                  multiline
                  autoFocus
                  numberOfLines={3}
                  textAlignVertical="top"
                  className="mb-3 rounded-xl bg-background p-3 text-sm text-foreground"
                  style={{ minHeight: 80 }}
                />
              ) : null}
              <Separator />
              <ListRow stacked icon={<Icon icon={Timer} size={18} color="muted-foreground" />} title="Rest for all exercises">
                <RestPresetBar onSelect={engine.setRestForAll} />
              </ListRow>
              <Separator />
              <ListRow
                icon={<Icon icon={METRIC_ICONS.equipment} size={18} color="muted-foreground" />}
                title="Plate calculator"
                onPress={() => router.push('/(app)/plate-calculator' as Href)}
              />
            </Card>
          </Section>
        ) : null}

        {muscleKey ? (
          <Section title="Muscles worked">
            <SessionMuscleMap muscleKey={muscleKey} />
          </Section>
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
