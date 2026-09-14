import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Clock, Calendar, Plus, Flame, Undo2 } from 'lucide-react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { Icon } from '@/components/common/icon';
import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';
import { ExerciseThumb } from '@/components/exercise/exercise-media';

import { Body, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { NumberStepper } from '@/components/workout/number-stepper';
import { SetRow } from '@/components/workout/set-row';
import { RpeChips } from '@/components/workout/rpe-chips';
import { SummaryStat } from '@/components/workout/summary-stat';
import { ExercisePickerSheet } from '@/components/workout/exercise-picker-sheet';
import { useToast } from '@/components/ui/toast';
import { useHaptics } from '@/hooks/use-haptics';
import { useSettings } from '@/store/settings-store';
import {
  addExerciseToWorkout,
  addSet,
  addWarmUpSet,
  getWorkoutLog,
  removeSet,
  updateSet,
  updateWorkoutDuration,
  updateWorkoutNotes,
  updateWorkoutLogStartedAt,
  type SessionWorkout,
  type SessionSet,
} from '@/db/queries';
import { openDatabase } from '@/db/client';
import { formatDuration, formatVolume, formatFullDateTime } from '@/db/calc';
import type { Exercise, SetEntry } from '@/db/types';
import { METRIC_ICONS } from '@/lib/metric-icons';
import { usePrimaryHex } from '@/lib/theme';

interface ExerciseGroup {
  exerciseId: number;
  exerciseName: string;
  imageUrl: string | null;
  sets: SessionSet[];
}

export default function EditWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const logId = Number(id);
  const router = useRouter();
  const { toast } = useToast();
  const { impact } = useHaptics();
  const { unit, showRpe } = useSettings();
  const accentColor = usePrimaryHex();
  const [log, setLog] = useState<SessionWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [pickerStep, setPickerStep] = useState<'none' | 'date' | 'time'>('none');
  const [draftDate, setDraftDate] = useState<Date | null>(null);
  const [durationOpen, setDurationOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removedSet, setRemovedSet] = useState<{ setEntry: SetEntry; exerciseId: number; logId: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const s = await getWorkoutLog(logId);
    setLog(s);
    if (s) setNotes(s.notes ?? '');
    setLoading(false);
  }, [logId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // Build groups with image URLs
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);

  useEffect(() => {
    if (!log) return;
    const map = new Map<number, ExerciseGroup>();
    for (const s of log.sets) {
      let g = map.get(s.exerciseId);
      if (!g) {
        g = { exerciseId: s.exerciseId, exerciseName: s.exerciseName, imageUrl: null, sets: [] };
        map.set(s.exerciseId, g);
      }
      g.sets.push(s);
    }
    setGroups([...map.values()]);
  }, [log]);

  // Load image URLs for exercises
  useEffect(() => {
    if (groups.length === 0) return;
    const ids = groups.map((g) => g.exerciseId);
    if (ids.length === 0) return;
    (async () => {
      const { openDatabase } = await import('@/db/client');
      const db = await openDatabase();
      const placeholders = ids.map(() => '?').join(',');
      const rows = await db.getAllAsync<{ exercise_id: number; url: string }>(
        `SELECT exercise_id, url FROM exercise_images WHERE exercise_id IN (${placeholders}) AND is_primary = 1`,
        ...ids,
      );
      const imgMap = new Map<number, string>();
      for (const r of rows) imgMap.set(r.exercise_id, r.url);
      setGroups((prev) =>
        prev.map((g) => ({ ...g, imageUrl: imgMap.get(g.exerciseId) ?? g.imageUrl })),
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length]);

  const onChangeWeight = async (setId: number, value: number) => {
    impact();
    await updateSet(setId, { weight: value });
    load();
  };

  const onChangeReps = async (setId: number, value: number) => {
    impact();
    await updateSet(setId, { reps: value });
    load();
  };

  const onToggleComplete = async (setId: number) => {
    const target = log?.sets.find((x) => x.id === setId);
    const next = !target?.completed;
    await updateSet(setId, { completed: next });
    impact();
    load();
  };

  const onChangeRpe = async (setId: number, rpe: number | null) => {
    await updateSet(setId, { rpe });
    load();
  };

  const onAddSet = async (exerciseId: number) => {
    impact();
    await addSet(logId, exerciseId);
    load();
  };

  const onAddWarmUp = async (exerciseId: number) => {
    impact();
    await addWarmUpSet(logId, exerciseId);
    load();
  };

  const onRemoveSet = async (setId: number) => {
    const target = log?.sets.find((s) => s.id === setId);
    if (!target) return;
    setRemovedSet({ setEntry: target, exerciseId: target.exerciseId, logId });
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setRemovedSet(null), 5000);
    await removeSet(setId);
    load();
  };

  const onUndoRemove = async () => {
    if (!removedSet) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const { setEntry, logId: lid } = removedSet;
    const db = await openDatabase();
    await db.runAsync(
      `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, rest_seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      lid, setEntry.exerciseId, setEntry.setIndex, setEntry.weight, setEntry.reps, setEntry.completed ? 1 : 0, setEntry.restSeconds, setEntry.createdAt,
    );
    setRemovedSet(null);
    load();
  };

  const onPickExercise = async (ex: Exercise) => {
    impact();
    await addExerciseToWorkout(logId, ex.id);
    setPickerOpen(false);
    load();
  };

  const onChangeDuration = async (minutes: number) => {
    impact();
    await updateWorkoutDuration(logId, Math.max(0, minutes) * 60);
    load();
    toast({ title: 'Duration updated', variant: 'success' });
  };

  const handleSave = async () => {
    setSaving(true);
    impact();
    try {
      if (notes.trim()) await updateWorkoutNotes(logId, notes.trim());
      toast({ title: 'Changes saved', variant: 'success' });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const openDatePicker = () => {
    setDraftDate(new Date(log?.startedAt ?? Date.now()));
    setPickerStep('date');
  };

  const commitDateTime = async (date: Date) => {
    setPickerStep('none');
    setDraftDate(null);
    await updateWorkoutLogStartedAt(logId, date.getTime());
    await load();
    toast({ title: 'Workout date updated', variant: 'success' });
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

  const completedSets = log.sets.filter((s) => s.completed).length;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
        <Button variant="ghost" size="sm" onPress={() => router.back()}>
          Cancel
        </Button>
        <Body className="text-base font-semibold text-foreground">Edit Workout</Body>
        <Button variant="ghost" size="sm" onPress={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {/* Workout name with close button */}
        <View className="mb-4 flex-row items-center justify-between">
          <Body className="flex-1 text-xl font-bold text-foreground">{log.name}</Body>
          <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Close">
            <View className="h-6 w-6 items-center justify-center rounded-full bg-muted">
              <Icon icon={X} size={14} color="muted-foreground" />
            </View>
          </Pressable>
        </View>

        {/* Stats row */}
        <View className="mb-5 flex-row gap-3">
          <Pressable
            onPress={() => setDurationOpen(!durationOpen)}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            className="flex-1"
            accessibilityRole="button"
            accessibilityLabel="Edit workout duration">
            <SummaryStat
              label="Duration"
              value={formatDuration(log.durationSeconds)}
              icon={<Icon icon={Clock} size={18} color="primary" />}
            />
          </Pressable>
          <SummaryStat label="Volume" value={formatVolume(log.totalVolume, unit)} icon={<Icon icon={METRIC_ICONS.volume} size={18} color="info" />} />
          <SummaryStat label="Sets" value={`${completedSets}`} icon={<Icon icon={METRIC_ICONS.sets} size={18} color="warning" />} />
        </View>

        {durationOpen ? (
          <View className="mb-5 rounded-xl border border-border/40 bg-card p-4">
            <Caption className="mb-2">Duration (minutes)</Caption>
            <NumberStepper
              value={Math.max(1, Math.round(log.durationSeconds / 60))}
              onChange={onChangeDuration}
              step={1}
              min={0}
              max={1440}
              suffix="min"
            />
          </View>
        ) : null}

        {/* Notes */}
        <View className="mb-5">
          <Caption className="mb-1">Description</Caption>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            onBlur={() => { if (notes.trim()) updateWorkoutNotes(logId, notes.trim()); }}
            placeholder="How did your workout go? Leave some notes here..."
            placeholderTextColor="#6b7280"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            style={{ minHeight: 80, fontSize: 14, lineHeight: 20, borderWidth: 1, borderColor: 'hsl(240 5.9% 90%)', borderRadius: 12, padding: 12 }}
          />
        </View>

        {/* Date */}
        <Pressable
          onPress={openDatePicker}
          className="mb-4 flex-row items-center justify-between rounded-xl border border-border/40 bg-card p-4"
          accessibilityRole="button"
          accessibilityLabel="Edit workout date and time">
          <View className="flex-row items-center gap-3">
            <Icon icon={Calendar} size={18} color="muted-foreground" />
            <Caption>Date</Caption>
          </View>
          <View className="flex-row items-center gap-1">
            <Caption>{formatFullDateTime(log.startedAt)}</Caption>
            <Caption className="text-muted-foreground"> ›</Caption>
          </View>
        </Pressable>

        {pickerStep !== 'none' ? (
          <View className="mb-4 rounded-xl border border-border/40 bg-card p-3">
            {Platform.OS === 'ios' ? (
              <DateTimePicker
                value={draftDate ?? new Date(log.startedAt)}
                mode="datetime"
                display="inline"
                accentColor={accentColor}
                onValueChange={(_, d) => commitDateTime(d)}
              />
            ) : pickerStep === 'date' ? (
              <DateTimePicker
                value={draftDate ?? new Date(log.startedAt)}
                mode="date"
                accentColor={accentColor}
                positiveButton={{ label: 'Next' }}
                onValueChange={(_, d) => {
                  setDraftDate(d);
                  setPickerStep('time');
                }}
                onDismiss={() => setPickerStep('none')}
              />
            ) : (
              <DateTimePicker
                value={draftDate ?? new Date(log.startedAt)}
                mode="time"
                accentColor={accentColor}
                positiveButton={{ label: 'Done' }}
                onValueChange={(_, t) => {
                  const combined = new Date(draftDate ?? new Date(log.startedAt));
                  combined.setHours(t.getHours(), t.getMinutes(), t.getSeconds(), t.getMilliseconds());
                  commitDateTime(combined);
                }}
                onDismiss={() => setPickerStep('none')}
              />
            )}
          </View>
        ) : null}

        {/* Divider */}
        <View className="my-4 h-px bg-border/40" />

        {/* Add exercise */}
        <Button
          variant="outline"
          className="mb-4"
          leftIcon={<Icon icon={Plus} size={16} color="primary" />}
          onPress={() => setPickerOpen(true)}>
          Add exercise
        </Button>

        {/* Exercise list */}
        <View className="gap-5">
          {groups.map((g) => (
            <View key={g.exerciseId}>
              {/* Exercise header */}
              <Pressable
                onPress={() => router.push(`/exercise/${g.exerciseId}`)}
                style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                className="mb-1 flex-row items-center gap-3"
                accessibilityRole="button"
                accessibilityLabel={`Open ${g.exerciseName} details`}>
                <ExerciseThumb name={g.exerciseName} imageUrl={g.imageUrl} />
                <Body className="flex-1 text-base font-semibold text-primary">{g.exerciseName}</Body>
              </Pressable>

              {/* Add notes placeholder */}
              <Caption className="mb-2 px-1">Add notes here...</Caption>

              {/* Set table header */}
              <View className="mb-1 flex-row items-center gap-1 px-1">
                <View className="w-6 items-center"><Caption>SET</Caption></View>
                <View className="w-[72px] items-center"><Caption>PREVIOUS</Caption></View>
                <View className="flex-1 flex-row">
                  <View className="flex-1 items-center"><Caption>{unit === 'metric' ? 'KG' : 'LB'}</Caption></View>
                  <View className="flex-1 items-center"><Caption>REPS</Caption></View>
                </View>
                <View className="w-12" />
              </View>

              {/* Sets */}
              {g.sets.map((s, i) => (
                <View key={s.id}>
                  <SetRow
                    index={s.setIndex}
                    weight={s.weight}
                    reps={s.reps}
                    previousWeight={i > 0 ? g.sets[i - 1].weight : undefined}
                    previousReps={i > 0 ? g.sets[i - 1].reps : undefined}
                    completed={s.completed}
                    unit={unit}
                    onChangeWeight={(v) => onChangeWeight(s.id, v)}
                    onChangeReps={(v) => onChangeReps(s.id, v)}
                    onToggleComplete={() => onToggleComplete(s.id)}
                    onRemove={g.sets.length > 1 ? () => onRemoveSet(s.id) : undefined}
                  />
                  {showRpe && s.completed && (s.setType ?? 'working') !== 'warmup' ? (
                    <RpeChips value={s.rpe ?? null} onChange={(v) => onChangeRpe(s.id, v)} />
                  ) : null}
                </View>
              ))}

              {/* Add set */}
              <Pressable
                onPress={() => onAddSet(g.exerciseId)}
                style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                className="mt-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 py-2"
                accessibilityRole="button"
                accessibilityLabel={`Add set to ${g.exerciseName}`}>
                <Icon icon={Plus} size={15} color="primary" />
                <Body className="text-sm font-medium text-primary">Add set</Body>
              </Pressable>

              {/* Warm-up set */}
              <Pressable
                onPress={() => onAddWarmUp(g.exerciseId)}
                style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                className="mt-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 py-2"
                accessibilityRole="button"
                accessibilityLabel={`Add warm-up set to ${g.exerciseName}`}>
                <Icon icon={Flame} size={15} color="warning" />
                <Body className="text-sm font-medium text-warning">Warm-up (~50%)</Body>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>

      {removedSet ? (
        <View className="absolute inset-x-0 bottom-16 z-30 px-4">
          <View className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
            <Body className="text-sm text-foreground">Set removed</Body>
            <Pressable
              onPress={onUndoRemove}
              accessibilityRole="button"
              accessibilityLabel="Undo remove set"
              className="flex-row items-center gap-1.5 rounded-lg bg-primary px-3 py-2">
              <Icon icon={Undo2} size={14} color="primary-foreground" />
              <Body className="text-sm font-semibold text-primary-foreground">Undo</Body>
            </Pressable>
          </View>
        </View>
      ) : null}

      <ExercisePickerSheet open={pickerOpen} onOpenChange={setPickerOpen} onPick={onPickExercise} />
    </SafeAreaView>
  );
}
