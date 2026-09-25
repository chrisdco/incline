import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, MessageSquarePlus, Pause, Play, Plus, Undo2, X } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Body, Caption } from '@/components/common/text';
import { ListSkeleton } from '@/components/common/skeleton';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Sheet } from '@/components/ui/sheet';
import { ExerciseBlock } from '@/components/workout/exercise-block';
import { DiscardSessionDialog } from '@/components/workout/discard-session-dialog';
import { RestTimer } from '@/components/workout/rest-timer';
import { RestPresetBar } from '@/components/workout/rest-preset-bar';
import { useRestTimer } from '@/hooks/use-rest-timer';
import { useRestTimerSound } from '@/hooks/use-rest-timer-sound';
import { useHaptics } from '@/hooks/use-haptics';
import { useActiveWorkout } from '@/store/active-workout-store';
import { useSettings } from '@/store/settings-store';
import { useToast } from '@/components/ui/toast';
import {
  addSet,
  addWarmUpSet,
  discardWorkout,
  finishWorkout,
  getExercisePRSummary,
  getLastSetsForExercises,
  getRestDefaultsForSession,
  getTemplateSuggestions,
  getSessionGhost,
  getWorkoutLog,
  removeExerciseFromWorkout,
  removeSet,
  restoreSet,
  updateSet,
  updateWorkoutNotes,
  type ExercisePRSummary,
  type SessionWorkout,
} from '@/db/queries';
import { formatClock, formatVolume, formatWeight } from '@/db/calc';
import { dropCachedSession, getCachedSession, setCachedSession } from '@/db/session-cache';
import {
  applySetToBests,
  bestsFromPrSummary,
  detectSetRecords,
  formatCelebrationKinds,
  isCelebrationPrKind,
} from '@/coaching/pr';
import { SCREEN_CONTENT_CTA } from '@/lib/layout';
import { motionDuration } from '@/styles/motion';
import { PLACEHOLDER_COLOR } from '@/constants/config';
import { METRIC_ICONS } from '@/lib/metric-icons';
import { MuscleBodyMap } from '@/components/progress/muscle-body-map';
import { shouldStartRestAfterComplete } from '@/lib/superset-rest';

import type { MuscleGroup, SetEntry, SetType } from '@/db/types';
import type { TrainingSuggestion } from '@/coaching/types';
import type { SessionGhost } from '@/db/queries';

interface Group {
  exerciseId: number;
  exerciseName: string;
  sets: SetEntry[];
  supersetGroup: number | null;
}

/**
 * Elapsed workout clock. Isolated so the 1s tick re-renders only this text,
 * not the whole session (every set row + input) underneath it.
 */
function SessionClock({
  startedAt,
  pausedAtRef,
  totalPausedMsRef,
  className,
}: {
  startedAt: number;
  pausedAtRef: RefObject<number | null>;
  totalPausedMsRef: RefObject<number>;
  className?: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => {
      if (pausedAtRef.current) return;
      setElapsed(Math.floor((Date.now() - startedAt - totalPausedMsRef.current) / 1000));
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [startedAt, pausedAtRef, totalPausedMsRef]);
  return <Body className={className}>{formatClock(elapsed)}</Body>;
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const logId = Number(id);
  const router = useRouter();
  const { toast } = useToast();
  const { impact, notify } = useHaptics();
  const clear = useActiveWorkout((s) => s.clear);
  const { unit, setUnit, restSoundEnabled, autoStartRest, defaultRestSeconds, showWarmUpSets, showRpe, keepScreenAwake, showSessionGhost } = useSettings();
  const rest = useRestTimer({ notify: restSoundEnabled, sessionId: logId });
  const restSound = useRestTimerSound();

  useEffect(() => {
    if (!keepScreenAwake) return;
    let cancelled = false;
    void import('expo-keep-awake').then(({ activateKeepAwakeAsync }) => {
      if (!cancelled) void activateKeepAwakeAsync('incline-session');
    });
    return () => {
      cancelled = true;
      void import('expo-keep-awake').then(({ deactivateKeepAwake }) => {
        deactivateKeepAwake('incline-session');
      });
    };
  }, [keepScreenAwake]);

  // Play sound when rest timer finishes
  useEffect(() => {
    if (rest.justFinished && restSoundEnabled) restSound.play();
  }, [rest.justFinished, restSound, restSoundEnabled]);

  // Stale-while-revalidate: reopening (tray tap, resume dialog) renders cached
  // rows synchronously instead of flashing a spinner mid-transition, then
  // refreshes from SQLite in the background. Single-writer + wipe-cleared
  // cache (see session-cache.ts) keeps this safe.
  const [session, setSession] = useState<SessionWorkout | null>(() => getCachedSession(logId));
  const [lastSetsMap, setLastSetsMap] = useState<Record<number, SetEntry[]>>({});
  const [prMap, setPrMap] = useState<Record<number, ExercisePRSummary>>({});
  const [suggestionMap, setSuggestionMap] = useState<Record<number, TrainingSuggestion>>({});
  const [ghost, setGhost] = useState<SessionGhost | null>(null);
  const [loading, setLoading] = useState(() => getCachedSession(logId) == null);
  const scrollRef = useRef<ScrollView>(null);
  const groupRefs = useRef<(View | null)[]>([]);
  const prevActiveGroupRef = useRef<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ exerciseId: number; name: string } | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [restSecondsMap, setRestSecondsMap] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const notesRef = useRef<TextInput>(null);
  const [removedSet, setRemovedSet] = useState<{ setEntry: SetEntry; exerciseId: number; logId: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const totalPausedMsRef = useRef(0);
  const [timerSheetOpen, setTimerSheetOpen] = useState(false);
  const [restKind, setRestKind] = useState<'set' | 'superset'>('set');
  const pausedAtRef = useRef<number | null>(null);
  const seededRestRef = useRef(false);

  // Pause keep-awake while the workout is paused
  useEffect(() => {
    if (!keepScreenAwake) return;
    if (pausedAt !== null) {
      void import('expo-keep-awake').then(({ deactivateKeepAwake }) => {
        deactivateKeepAwake('incline-session');
      });
    } else {
      void import('expo-keep-awake').then(({ activateKeepAwakeAsync }) => {
        void activateKeepAwakeAsync('incline-session');
      });
    }
  }, [keepScreenAwake, pausedAt]);

  const loadSession = useCallback(async () => {
    const s = await getWorkoutLog(logId);
    setSession(s);
    if (s) setNotes(s.notes ?? '');
    setLoading(false);
    return s;
  }, [logId]);

  // Assist data (last-session values, PRs, suggestions, ghost) is expensive
  // and never changes on field edits — load it on open / structural change
  // only, never on tick/type/delete. The run guard drops stale responses when
  // a newer assist run supersedes (e.g. exercise added mid-flight).
  const assistRunRef = useRef(0);
  const loadAssist = useCallback(async (s: SessionWorkout) => {
    const run = (assistRunRef.current += 1);
    const exIds = [...new Set(s.sets.map((x) => x.exerciseId))];
    const [lastMap, prEntries, templateSug, ghostRow] = await Promise.all([
      getLastSetsForExercises(exIds),
      Promise.all(exIds.map(async (eid) => [eid, await getExercisePRSummary(eid)] as const)),
      s.templateId ? getTemplateSuggestions(s.templateId, unit) : Promise.resolve([]),
      showSessionGhost
        ? getSessionGhost({
            templateId: s.templateId,
            name: s.templateId ? null : s.name,
            beforeStartedAt: s.startedAt,
            excludeLogId: s.id,
          })
        : Promise.resolve(null),
    ]);
    if (assistRunRef.current !== run) return;
    setLastSetsMap(lastMap);
    setPrMap(Object.fromEntries(prEntries));
    setSuggestionMap(Object.fromEntries(templateSug.map((sug) => [sug.exerciseId, sug])));
    setGhost(ghostRow);
  }, [logId, unit, showSessionGhost]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const s = await loadSession();
      if (!active || !s) return;
      for (const id of new Set(s.sets.map((x) => x.exerciseId))) assistKnownRef.current.add(id);
      if (!seededRestRef.current) {
        seededRestRef.current = true;
        void getRestDefaultsForSession(logId).then(setRestSecondsMap);
      }
      void loadAssist(s);
    })();
    return () => {
      active = false;
    };
  }, [loadSession, loadAssist, logId]);

  // Pick/reorder screens write directly then go back — refresh rows on
  // return. Cheap SELECT; rest defaults merge for newly added exercises only
  // (never clobber edits). Assist reloads only for exercises it hasn't seen:
  // the pick screen's whole point is adding something new, which would
  // otherwise show empty Last/PR/Suggested until remount.
  const assistKnownRef = useRef<Set<number>>(new Set());
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const s = await loadSession();
        if (!s) return;
        const ids = [...new Set(s.sets.map((x) => x.exerciseId))];
        const unseen = ids.filter((id) => !assistKnownRef.current.has(id));
        if (unseen.length > 0) {
          for (const id of ids) assistKnownRef.current.add(id);
          void loadAssist(s);
        }
      })();
      void getRestDefaultsForSession(logId).then((defaults) => {
        setRestSecondsMap((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const [key, value] of Object.entries(defaults)) {
            const id = Number(key);
            if (next[id] === undefined) {
              next[id] = value;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      });
    }, [loadSession, loadAssist, logId]),
  );

  // Keep the reopen cache fresh on every state change (optimistic edits flow
  // through here too, so the cache never lags the UI).
  useEffect(() => {
    if (session) setCachedSession(session);
  }, [session]);

  useEffect(() => {
    if (session?.isComplete) router.replace(`/summary/${session.id}`);
  }, [session?.isComplete, session?.id, router]);

  // Cleanup undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const onPause = () => {
    const now = Date.now();
    setPausedAt(now);
    pausedAtRef.current = now;
    impact();
  };

  const onResume = () => {
    if (pausedAt) {
      totalPausedMsRef.current += Date.now() - pausedAt;
      setPausedAt(null);
      pausedAtRef.current = null;
      impact();
    }
  };

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

  // Cheap path: session rows only (field edits never need assist data).
  const reload = () => {
    void loadSession();
  };
  // Structural path: rows + assist (exercise added / set undeleted).
  const reloadAll = () => {
    void (async () => {
      const s = await loadSession();
      if (s) void loadAssist(s);
    })();
  };
  // Optimistic field edits: paint immediately, persist in the background.
  // Reloads are failure-only — assist maps (last/PR/suggestions) don't change
  // on a weight/reps keystroke, so a full refetch per edit is pure jank.
  const onChangeWeight = (setId: number, v: number) => {
    setSession((prev) =>
      prev
        ? { ...prev, sets: prev.sets.map((s) => (s.id === setId ? { ...s, weight: v } : s)) }
        : prev,
    );
    updateSet(setId, { weight: v }).catch(() => {
      toast({ title: 'Could not save weight', variant: 'destructive' });
      reload();
    });
  };
  const onChangeReps = (setId: number, v: number) => {
    setSession((prev) =>
      prev
        ? { ...prev, sets: prev.sets.map((s) => (s.id === setId ? { ...s, reps: v } : s)) }
        : prev,
    );
    updateSet(setId, { reps: v }).catch(() => {
      toast({ title: 'Could not save reps', variant: 'destructive' });
      reload();
    });
  };
  const onApplyLoad = async (exerciseId: number, weight: number, reps?: number) => {
    const groupSets = session?.sets.filter((s) => s.exerciseId === exerciseId) ?? [];
    const target = groupSets.find((s) => !s.completed) ?? groupSets.at(-1);
    if (!target) return;
    impact();
    try {
      await updateSet(target.id, {
        weight,
        ...(reps != null && reps > 0 ? { reps } : null),
      });
      reload();
    } catch {
      toast({ title: 'Could not apply load', variant: 'destructive' });
    }
  };
  const onChangeRestSeconds = (exerciseId: number, seconds: number) => {
    setRestSecondsMap((prev) => ({ ...prev, [exerciseId]: seconds }));
  };
  const applyRestToAll = (seconds: number) => {
    const map: Record<number, number> = {};
    for (const s of session?.sets ?? []) {
      map[s.exerciseId] = seconds;
    }
    setRestSecondsMap(map);
  };
  const onToggleComplete = (setId: number) => {
    const target = session?.sets.find((x) => x.id === setId);
    if (!target) return;
    const next = !target.completed;
    const restSec = next ? (restSecondsMap[target.exerciseId] ?? 0) : null;
    // Optimistic update: flip the row and start the rest timer immediately,
    // then persist to the DB in the background (no full reload/refetch).
    setSession((prev) =>
      prev
        ? {
            ...prev,
            sets: prev.sets.map((s) =>
              s.id === setId ? { ...s, completed: next, restSeconds: restSec } : s,
            ),
          }
        : prev,
    );
    updateSet(setId, { completed: next, restSeconds: restSec }).catch(() => {
      toast({ title: 'Could not save set', description: 'Please try again.', variant: 'destructive' });
      reload();
    });
    // Haptics handled in SetRow (Medium + Success on complete, Light on uncheck)
    if (next) {
      // Celebrate only a genuine record: heavier weight or better estimated
      // 1RM than the best ever logged for this exercise. Requires prior
      // history so first-time lifts don't spam.
      const pr = prMap[target.exerciseId];
      if (pr && (pr.heaviestWeight > 0 || pr.best1RM > 0)) {
        const prior = bestsFromPrSummary(pr);
        const kinds = detectSetRecords(
          {
            exerciseId: target.exerciseId,
            weight: target.weight,
            reps: target.reps,
            completed: true,
            setType: target.setType,
            createdAt: Date.now(),
          },
          prior,
          { requirePriorHistory: true },
        ).filter(isCelebrationPrKind);
        if (kinds.length > 0) {
          setPrMap((prev) => {
            const cur = prev[target.exerciseId];
            if (!cur) return prev;
            const next = applySetToBests(prior, {
              exerciseId: target.exerciseId,
              weight: target.weight,
              reps: target.reps,
              completed: true,
              setType: target.setType,
              createdAt: Date.now(),
            });
            return {
              ...prev,
              [target.exerciseId]: {
                ...cur,
                heaviestWeight: next.heaviestWeight,
                best1RM: next.estimated1RM,
                bestSetVolume: Math.max(cur.bestSetVolume, next.bestSetVolume),
              },
            };
          });
          notify();
          toast({
            title: 'New PR!',
            description: `${target.exerciseName} · ${formatWeight(target.weight, unit)} × ${target.reps} · ${formatCelebrationKinds(kinds, target.reps)}`,
            variant: 'success',
          });
        }
      }
      if (autoStartRest) {
        const nextSets = (session?.sets ?? []).map((s) =>
          s.id === setId ? { ...s, completed: true } : s,
        );
        const decision = shouldStartRestAfterComplete(nextSets, setId);
        if (decision.start) {
          const exRest = restSecondsMap[target.exerciseId] ?? defaultRestSeconds;
          if (exRest > 0) {
            setRestKind(decision.kind);
            rest.start(exRest);
          }
        }
      }
    }
  };
  const onChangeRpe = (setId: number, rpe: number | null) => {
    setSession((prev) =>
      prev
        ? {
            ...prev,
            sets: prev.sets.map((s) => (s.id === setId ? { ...s, rpe } : s)),
          }
        : prev,
    );
    updateSet(setId, { rpe }).catch(() => {
      toast({ title: 'Could not save RPE', variant: 'destructive' });
      reload();
    });
  };
  const onChangeSetType = (setId: number, setType: SetType) => {
    setSession((prev) =>
      prev
        ? { ...prev, sets: prev.sets.map((s) => (s.id === setId ? { ...s, setType } : s)) }
        : prev,
    );
    updateSet(setId, { setType }).catch(() => {
      toast({ title: 'Could not save set type', variant: 'destructive' });
      reload();
    });
  };
  const onRemoveSet = (setId: number) => {
    const target = session?.sets.find((s) => s.id === setId);
    if (!target) return;
    // Save the removed set for undo
    setRemovedSet({ setEntry: target, exerciseId: target.exerciseId, logId });
    // Clear any existing undo timer
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    // Auto-dismiss after 5 seconds
    undoTimerRef.current = setTimeout(() => setRemovedSet(null), 5000);
    // Optimistic removal: drop the row now, persist in the background.
    setSession((prev) =>
      prev ? { ...prev, sets: prev.sets.filter((s) => s.id !== setId) } : prev,
    );
    removeSet(setId).catch(() => {
      toast({ title: 'Could not delete set', variant: 'destructive' });
      setRemovedSet(null);
      reload();
    });
  };
  const onUndoRemove = async () => {
    if (!removedSet) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    try {
      await restoreSet(removedSet.setEntry.id);
      setRemovedSet(null);
      reloadAll();
    } catch {
      toast({ title: 'Could not undo', variant: 'destructive' });
      reload();
    }
  };
  const onAddSet = async (exerciseId: number) => { impact(); await addSet(logId, exerciseId); reload(); };
  const onAddWarmUp = async (exerciseId: number) => { impact(); await addWarmUpSet(logId, exerciseId); reload(); };
  const openAddExercise = () => {
    router.push(`/pick-exercise?logId=${logId}&mode=add` as Href);
  };
  const openReplaceExercise = (exerciseId: number, name: string) => {
    router.push(
      `/pick-exercise?logId=${logId}&mode=replace&exerciseId=${exerciseId}&name=${encodeURIComponent(name)}` as Href,
    );
  };
  const openReorder = () => {
    router.push(`/session/reorder/${logId}` as Href);
  };
  const removeTargetExercise = async () => {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    impact();
    try {
      const { removed } = await removeExerciseFromWorkout(logId, target.exerciseId);
      reloadAll();
      toast({
        title: `${target.name} removed`,
        description:
          removed > 0
            ? `${removed} set${removed === 1 ? '' : 's'} left this session. Your routine is untouched.`
            : undefined,
        variant: 'info',
      });
    } catch {
      toast({ title: 'Could not remove exercise', variant: 'destructive' });
    }
  };

  const finish = async () => {
    // Guard double-tap: finishWorkout now awaits enqueues, widening the
    // window where a second tap would double-close and double-navigate.
    if (finishing) return;
    setFinishing(true);
    setFinishOpen(false);
    rest.stop();
    try {
      if (notes.trim()) await updateWorkoutNotes(logId, notes.trim());
      const pauseBonus = pausedAt ? Date.now() - pausedAt : 0;
      const pausedMs = totalPausedMsRef.current + pauseBonus;
      await finishWorkout(logId, { pausedMs });
      clear();
      dropCachedSession(logId);
      toast({ title: 'Workout saved', variant: 'success' });
      router.replace(`/summary/${logId}?celebrate=1`);
    } catch {
      setFinishing(false);
      toast({ title: 'Could not save workout', description: 'Please try again.', variant: 'destructive' });
    }
  };
  const discard = async () => {
    if (discarding) return;
    setDiscarding(true);
    setDiscardOpen(false);
    rest.stop();
    try {
      await discardWorkout(logId);
      clear();
      dropCachedSession(logId);
      router.replace('/(app)/(tabs)');
    } catch {
      setDiscarding(false);
      toast({ title: 'Could not discard workout', variant: 'destructive' });
    }
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
  const totalVolume = session.sets.reduce((acc, s) => acc + (s.completed ? s.weight * s.reps : 0), 0);

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
          <SessionClock
            startedAt={session.startedAt}
            pausedAtRef={pausedAtRef}
            totalPausedMsRef={totalPausedMsRef}
            className="mt-0.5 font-semibold text-primary"
          />
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
                  onChangeRestSeconds={(s) => onChangeRestSeconds(g.exerciseId, s)}
                  onChangeWeight={onChangeWeight}
                  onChangeReps={onChangeReps}
                  onToggleComplete={onToggleComplete}
                  onRemoveSet={onRemoveSet}
                  onAddSet={() => onAddSet(g.exerciseId)}
                  onAddWarmUp={() => onAddWarmUp(g.exerciseId)}
                  onApplyLoad={(weight, reps) => onApplyLoad(g.exerciseId, weight, reps)}
                  onChangeRpe={onChangeRpe}
                  onChangeSetType={onChangeSetType}
                  onOpenExercise={() => router.push(`/exercise/${g.exerciseId}` as Href)}
                  onReplaceExercise={() => openReplaceExercise(g.exerciseId, g.exerciseName)}
                  onRemoveExercise={() => setRemoveTarget({ exerciseId: g.exerciseId, name: g.exerciseName })}
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
            <RestPresetBar onSelect={applyRestToAll} />
          </View>
        ) : null}

        <Pressable
          onPress={() => setNotesOpen(!notesOpen)}
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
              onChangeText={setNotes}
              onBlur={() => { if (session) updateWorkoutNotes(logId, notes); }}
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
      </ScrollView>

      {removedSet ? (
        <View className="absolute inset-x-0 bottom-20 z-30 px-4">
          <View className="flex-row items-center justify-between rounded-xl bg-card px-4 py-3 border border-border shadow-lg">
            <Body className="text-sm text-foreground">Set removed</Body>
            <Pressable
              onPress={onUndoRemove}
              accessibilityRole="button"
              accessibilityLabel="Undo remove set"
              className="flex-row items-center gap-1.5 rounded-lg bg-primary px-3 py-2">
              <Icon icon={Undo2} size={14} color="primary-foreground" />
              <Text className="text-sm font-semibold text-primary-foreground">Undo</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {rest.running || rest.remaining > 0 || rest.justFinished ? (
        <RestTimer
          remaining={rest.remaining}
          total={rest.total}
          caption={restKind === 'superset' ? 'Superset rest' : undefined}
          onAdd={rest.add}
          onSkip={rest.stop}
        />
      ) : null}

      <Dialog
        open={removeTarget != null}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        title={removeTarget ? `Remove ${removeTarget.name}?` : 'Remove exercise?'}
        description="Its sets leave this session. Your routine is untouched — finishing saves what you actually did as history."
        footer={
          <>
            <Button variant="outline" onPress={() => setRemoveTarget(null)}>Keep</Button>
            <Button variant="destructive" onPress={() => { void removeTargetExercise(); }}>Remove</Button>
          </>
        }
      />

      <Dialog
        open={finishOpen}
        onOpenChange={setFinishOpen}
        title="Finish workout?"
        description={
          completedSets < totalSets
            ? `You completed ${completedSets} of ${totalSets} sets — ${totalSets - completedSets} still open. Save this session to your history?`
            : `You completed ${completedSets} of ${totalSets} sets. Save this session to your history.`
        }
        footer={
          <>
            <Button variant="outline" onPress={() => setFinishOpen(false)} disabled={finishing}>Keep logging</Button>
            <Button variant="success" onPress={finish} disabled={finishing} loading={finishing}>Finish &amp; save</Button>
          </>
        }
      />
      <DiscardSessionDialog open={discardOpen} onOpenChange={(open) => { if (!discarding) setDiscardOpen(open); }} onConfirm={discard} pending={discarding} />

      <Sheet open={timerSheetOpen} onOpenChange={setTimerSheetOpen} title="Workout Timer" mode="fit">
        <View className="items-center gap-3 py-2">
          <Body className="text-sm text-muted-foreground">Elapsed time</Body>
          <SessionClock
            startedAt={session.startedAt}
            pausedAtRef={pausedAtRef}
            totalPausedMsRef={totalPausedMsRef}
            className="text-5xl font-bold tracking-tight text-foreground"
          />
          {pausedAt ? (
            <Caption className="text-amber-500">Paused</Caption>
          ) : null}
          <View className="mt-1 flex-row gap-3">
            {pausedAt ? (
              <Button
                size="lg"
                leftIcon={<Icon icon={Play} size={18} color="success-foreground" />}
                variant="success"
                onPress={onResume}>
                Resume
              </Button>
            ) : (
              <Button
                size="lg"
                leftIcon={<Icon icon={Pause} size={18} color="primary-foreground" />}
                onPress={onPause}>
                Pause
              </Button>
            )}
          </View>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
