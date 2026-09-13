import { useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';
import { Icon } from '@/components/common/icon';
import { Text } from '@/components/ui/text';
import { Body, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { SetRow, type SetRowHandle } from './set-row';
import { RpeChips } from './rpe-chips';
import { PreviousBestBadge } from './previous-best-badge';
import { RestTimerPickerSheet } from './rest-timer-picker-sheet';
import { estimated1RM, formatWeight, repsToBeat1RM } from '@/db/calc';
import type { SetEntry, Unit } from '@/db/types';
import type { ExercisePRSummary } from '@/db/queries';
import type { TrainingSuggestion } from '@/coaching/types';
import { detectSetFatigue } from '@/coaching/fatigue';
import { Plus, Clock, Flame, CircleHelp, ChevronRight, ArrowLeftRight } from 'lucide-react-native';
import { SET_COL } from './set-layout';

/**
 * One exercise within an active session: header (name + rest timer config) and
 * its set rows, plus an "Add set" action.
 *
 * PR / load assist details live behind a compact info affordance so the set
 * list stays the primary focus during logging.
 */
export function ExerciseBlock({
  name,
  exerciseId,
  sets,
  unit,
  lastSets,
  prSummary,
  restSeconds,
  onChangeRestSeconds,
  onChangeWeight,
  onChangeReps,
  onToggleComplete,
  onRemoveSet,
  onAddSet,
  onAddWarmUp,
  onApplyLoad,
  onChangeRpe,
  onOpenExercise,
  onSwap,
  showWarmUpSets = true,
  showRpe = true,
  loadSuggestion,
  className,
}: {
  name: string;
  exerciseId: number;
  sets: SetEntry[];
  unit: Unit;
  lastSets: SetEntry[];
  prSummary?: ExercisePRSummary | null;
  restSeconds: number;
  onChangeRestSeconds: (seconds: number) => void;
  onChangeWeight: (setId: number, v: number) => void;
  onChangeReps: (setId: number, v: number) => void;
  onToggleComplete: (setId: number) => void;
  onRemoveSet: (setId: number) => void;
  onAddSet: () => void;
  onAddWarmUp: () => void;
  /** Prefill the next incomplete set with a weight/reps suggestion. */
  onApplyLoad?: (weight: number, reps?: number) => void;
  onChangeRpe?: (setId: number, rpe: number | null) => void;
  /** Open exercise detail (history / charts). */
  onOpenExercise?: () => void;
  /** Open substitute picker — does not remove completed sets. */
  onSwap?: () => void;
  showWarmUpSets?: boolean;
  showRpe?: boolean;
  loadSuggestion?: TrainingSuggestion | null;
  className?: string;
}) {
  const [restPickerOpen, setRestPickerOpen] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const rowRefs = useRef<(SetRowHandle | null)[]>([]);
  const completedCount = sets.filter((s) => s.completed).length;
  const weightLabel = unit === 'metric' ? 'KG' : 'LB';

  const activeSet = sets.find((s) => !s.completed) ?? sets.at(-1) ?? null;
  const workingWeight = activeSet && activeSet.weight > 0
    ? activeSet.weight
    : lastSets.find((s) => s.weight > 0)?.weight ?? 0;
  const workingReps = activeSet?.reps ?? 0;

  const lastTop = lastSets.length > 0
    ? lastSets.reduce((best, s) => (s.weight > best.weight ? s : best), lastSets[0])
    : null;

  const prWeight = prSummary && prSummary.heaviestWeight > 0 ? prSummary.heaviestWeight : null;
  const best1RM = prSummary && prSummary.best1RM > 0 ? prSummary.best1RM : null;

  const prGap =
    prWeight != null && workingWeight > 0
      ? prWeight - workingWeight
      : null;

  const repsToPr =
    best1RM != null && workingWeight > 0
      ? repsToBeat1RM(workingWeight, best1RM)
      : null;

  const alreadyBeating =
    best1RM != null && workingWeight > 0 && workingReps > 0
      && estimated1RM(workingWeight, workingReps) > best1RM;

  const hasAssist =
    lastSets.length > 0 || prWeight != null || best1RM != null;

  /** Standalone assist icon only when no tappable info text exists to open the sheet. */
  const showAssistIcon =
    hasAssist && lastSets.length === 0 && !(loadSuggestion && loadSuggestion.weight > 0);

  const fatigue = useMemo(() => detectSetFatigue(sets, unit), [sets, unit]);

  const applyAndClose = (weight: number, reps?: number) => {
    onApplyLoad?.(weight, reps);
    setAssistOpen(false);
  };

  return (
    <View className={cn('gap-2 rounded-2xl px-1 py-1', className)}>
      <View className="flex-row items-center justify-between px-1">
        <View className="min-w-0 flex-1 pr-2">
          <Pressable
            onPress={onOpenExercise}
            disabled={!onOpenExercise}
            accessibilityRole={onOpenExercise ? 'button' : undefined}
            accessibilityLabel={onOpenExercise ? `Open ${name} details` : undefined}
            className="flex-row items-center gap-1 self-start">
            <Text className="text-base font-semibold text-foreground" numberOfLines={1}>{name}</Text>
            {onOpenExercise ? <Icon icon={ChevronRight} size={16} color="muted-foreground" /> : null}
          </Pressable>
          <View className="mt-1 flex-row items-center gap-2">
            <PreviousBestBadge
              lastSets={lastSets}
              unit={unit}
              onPress={hasAssist ? () => setAssistOpen(true) : undefined}
            />
            {alreadyBeating ? (
              <Pressable
                onPress={() => setAssistOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Exercise targets and shortcuts">
                <Text className="text-xs font-medium text-primary">PR pace</Text>
              </Pressable>
            ) : null}
            {loadSuggestion && loadSuggestion.weight > 0 ? (
              <Pressable
                onPress={() => setAssistOpen(true)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Use suggested load">
                <Text className="text-xs font-medium text-primary">
                  Suggested {formatWeight(loadSuggestion.weight, unit)} × {loadSuggestion.reps}
                </Text>
              </Pressable>
            ) : null}
            {onSwap ? (
              <Pressable
                onPress={onSwap}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Swap ${name}`}>
                <Icon icon={ArrowLeftRight} size={14} color="muted-foreground" />
              </Pressable>
            ) : null}
            {showAssistIcon ? (
              <Pressable
                onPress={() => setAssistOpen(true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Exercise progress details">
                <Icon icon={CircleHelp} size={14} color="muted-foreground" />
              </Pressable>
            ) : null}
          </View>
        </View>
        <View className="flex-row items-center gap-3">
          <Text className="text-xs text-muted-foreground">
            {completedCount}/{sets.length}
          </Text>
          <Pressable
            onPress={() => setRestPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Rest timer: ${restSeconds > 0 ? restSeconds + 's' : 'off'}`}
            className="flex-row items-center gap-1">
            <Icon icon={Clock} size={13} color={restSeconds > 0 ? 'primary' : 'muted-foreground'} />
            <Text className={cn('text-xs', restSeconds > 0 ? 'font-medium text-primary' : 'text-muted-foreground')}>
              {restSeconds > 0 ? `${restSeconds}s` : 'Off'}
            </Text>
          </Pressable>
        </View>
      </View>

      {fatigue ? (
        <View className="mx-1 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2">
          <Caption className="font-medium text-warning">{fatigue.title}</Caption>
          <Caption className="mt-0.5">{fatigue.body}</Caption>
          {onApplyLoad ? (
            <Pressable
              onPress={() => onApplyLoad(fatigue.suggestedWeight, fatigue.suggestedReps)}
              accessibilityRole="button"
              accessibilityLabel="Drop load on next set"
              className="mt-2 self-start">
              <Text className="text-xs font-semibold text-warning">
                Drop next set to {formatWeight(fatigue.suggestedWeight, unit)} × {fatigue.suggestedReps}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View className="flex-row items-center gap-2 px-1 pb-0.5">
        <View style={{ width: SET_COL.index }} className="items-center">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Set</Text>
        </View>
        <View style={{ width: SET_COL.prev }} className="items-center">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prev</Text>
        </View>
        <View style={{ width: SET_COL.weight }} className="items-center">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{weightLabel}</Text>
        </View>
        <View style={{ width: SET_COL.reps }} className="items-center">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Reps</Text>
        </View>
        <View className="flex-1" />
        <View style={{ width: SET_COL.done }} className="items-center">
          <Text className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Done</Text>
        </View>
      </View>

      <View className="gap-1">
        {sets.map((s, i) => (
          <View key={s.id}>
            <SetRow
              ref={(el) => { rowRefs.current[i] = el; }}
              index={i}
              weight={s.weight}
              reps={s.reps}
              previousWeight={lastSets[i]?.weight}
              previousReps={lastSets[i]?.reps}
              completed={s.completed}
              isNext={!s.completed && activeSet?.id === s.id}
              unit={unit}
              onChangeWeight={(v) => onChangeWeight(s.id, v)}
              onChangeReps={(v) => onChangeReps(s.id, v)}
              onApplyPrevious={
                lastSets[i] && lastSets[i].weight > 0
                  ? () => {
                      onChangeWeight(s.id, lastSets[i].weight);
                      onChangeReps(s.id, lastSets[i].reps);
                    }
                  : undefined
              }
              onToggleComplete={() => onToggleComplete(s.id)}
              onRemove={sets.length > 1 ? () => onRemoveSet(s.id) : undefined}
              onSubmitReps={i + 1 < sets.length ? () => rowRefs.current[i + 1]?.focusWeight() : undefined}
            />
            {showRpe && s.completed && (s.setType ?? 'working') !== 'warmup' && onChangeRpe ? (
              <RpeChips value={s.rpe ?? null} onChange={(v) => onChangeRpe(s.id, v)} />
            ) : null}
          </View>
        ))}
      </View>

      <Pressable
        onPress={onAddSet}
        className="mt-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 py-2"
        accessibilityRole="button"
        accessibilityLabel="Add set">
        <Icon icon={Plus} size={15} color="primary" />
        <Text className="text-sm font-medium text-primary">Add set</Text>
      </Pressable>

      {showWarmUpSets ? (
        <Pressable
          onPress={onAddWarmUp}
          className="mt-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 py-2"
          accessibilityRole="button"
          accessibilityLabel="Add warm-up set">
          <Icon icon={Flame} size={15} color="warning" />
          <Text className="text-sm font-medium text-warning">Warm-up (~50%)</Text>
        </Pressable>
      ) : null}

      <RestTimerPickerSheet
        open={restPickerOpen}
        onOpenChange={setRestPickerOpen}
        currentValue={restSeconds}
        exerciseId={exerciseId}
        onSelect={onChangeRestSeconds}
      />

      <Sheet
        open={assistOpen}
        onOpenChange={setAssistOpen}
        title="Targets & shortcuts"
        mode="half">
        <View className="gap-4 pb-2">
          <Caption className="text-foreground">{name}</Caption>
          <View className="gap-2">
            {lastTop && lastTop.weight > 0 ? (
              <AssistRow label="Last session best" value={`${formatWeight(lastTop.weight, unit)} × ${lastTop.reps}`} />
            ) : null}
            {best1RM != null ? (
              <AssistRow label="Best estimated 1RM" value={formatWeight(best1RM, unit)} />
            ) : null}
            {prWeight != null ? (
              <AssistRow label="Heaviest weight" value={formatWeight(prWeight, unit)} />
            ) : null}
            {prGap !== null && workingWeight > 0 ? (
              <AssistRow
                label="Gap to heaviest"
                value={
                  prGap > 0
                    ? `${formatWeight(prGap, unit)} to go`
                    : prGap === 0
                      ? 'Matching PR weight'
                      : `${formatWeight(Math.abs(prGap), unit)} over PR`
                }
              />
            ) : null}
            {alreadyBeating ? (
              <AssistRow label="Current set" value="Beating estimated 1RM" accent />
            ) : repsToPr != null && workingWeight > 0 ? (
              <AssistRow
                label="Reps to beat e1RM"
                value={`${repsToPr} @ ${formatWeight(workingWeight, unit)}`}
              />
            ) : null}
          </View>

            {onApplyLoad && (lastTop || prWeight || (loadSuggestion && loadSuggestion.weight > 0)) ? (
            <View className="gap-2">
              <Caption className="font-medium uppercase tracking-wide">Fill next incomplete set</Caption>
              {loadSuggestion && loadSuggestion.weight > 0 ? (
                <Button onPress={() => applyAndClose(loadSuggestion.weight, loadSuggestion.reps)}>
                  {`Use suggestion — ${formatWeight(loadSuggestion.weight, unit)} × ${loadSuggestion.reps}`}
                </Button>
              ) : null}
              {lastTop && lastTop.weight > 0 ? (
                <Button
                  variant="outline"
                  onPress={() => applyAndClose(lastTop.weight, lastTop.reps)}>
                  {`Use last session — ${formatWeight(lastTop.weight, unit)} × ${lastTop.reps}`}
                </Button>
              ) : null}
              {prWeight != null ? (
                <Button onPress={() => applyAndClose(prWeight)}>
                  {`Use PR weight — ${formatWeight(prWeight, unit)}`}
                </Button>
              ) : null}
            </View>
          ) : null}

          {onOpenExercise ? (
            <Button
              variant="ghost"
              onPress={() => {
                setAssistOpen(false);
                onOpenExercise();
              }}>
              Open exercise details
            </Button>
          ) : null}
          {onSwap ? (
            <Button
              variant="outline"
              onPress={() => {
                setAssistOpen(false);
                onSwap();
              }}>
              Swap exercise
            </Button>
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

function AssistRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Caption>{label}</Caption>
      <Body className={cn('font-medium', accent ? 'text-primary' : 'text-foreground')}>{value}</Body>
    </View>
  );
}
