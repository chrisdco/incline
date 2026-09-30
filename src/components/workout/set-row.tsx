import { useImperativeHandle, useRef, type Ref } from 'react';
import { Pressable, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/common/icon';
import { Check, Trash2 } from 'lucide-react-native';
import { useHaptics } from '@/hooks/use-haptics';
import * as Haptics from 'expo-haptics';
import { NumberStepper, type NumberStepperHandle } from './number-stepper';
import { SET_COL, SET_FLEX, SET_ROW_HEIGHT } from './set-layout';
import { formatWeight } from '@/db/calc';
import type { SetType, Unit } from '@/db/types';

export interface SetRowHandle {
  focusWeight: () => void;
}

const SET_TYPE_LETTER: Record<Exclude<SetType, 'working'>, string> = {
  warmup: 'W',
  drop: 'D',
  failure: 'F',
};

const SET_TYPE_LETTER_COLOR: Record<Exclude<SetType, 'working'>, string> = {
  warmup: 'text-warning',
  drop: 'text-info',
  failure: 'text-destructive',
};

const SET_TYPE_LABEL: Record<SetType, string> = {
  working: 'Working set',
  warmup: 'Warm-up',
  drop: 'Drop set',
  failure: 'To failure',
};

/** A single set row: index, previous, weight, reps, and a complete toggle.
 *
 * Reference anatomy (Hevy, Sep 2026 screenshots — do not regress):
 * number | PREV dim text (tappable = copy, never a box) | KG box | REPS box
 * | DONE circle. Touch targets must not bleed into neighboring cells
 * (no full-height stretch on text cells). The next set's circle carries the
 * accent ring. Any restyle must be checked side-by-side against the
 * reference before PR.
 */
export function SetRow({
  ref,
  index,
  weight,
  reps,
  previousWeight,
  previousReps,
  completed,
  isNext = false,
  unit,
  setType = 'working',
  onChangeWeight,
  onChangeReps,
  onApplyPrevious,
  onToggleComplete,
  onRemove,
  onSubmitReps,
  onOpenSetType,
}: {
  ref?: Ref<SetRowHandle>;
  index: number;
  weight: number;
  reps: number;
  previousWeight?: number;
  previousReps?: number;
  completed: boolean;
  /** True for the next incomplete set — gets the primary CTA treatment. */
  isNext?: boolean;
  unit: Unit;
  setType?: SetType;
  onChangeWeight: (v: number) => void;
  onChangeReps: (v: number) => void;
  onApplyPrevious?: () => void;
  onToggleComplete?: () => void;
  onRemove?: () => void;
  onSubmitReps?: () => void;
  /** When provided, the set number becomes a button opening the set-type menu. */
  onOpenSetType?: () => void;
}) {
  const weightRef = useRef<NumberStepperHandle>(null);
  const repsRef = useRef<NumberStepperHandle>(null);
  const swipeRef = useRef<Swipeable>(null);

  useImperativeHandle(ref, () => ({ focusWeight: () => weightRef.current?.focus() }), []);

  const { impact, selection, notify } = useHaptics();

  const hasPrevious = previousWeight !== undefined && previousWeight > 0;

  const toggleClass = cn(
    'h-11 w-11 items-center justify-center rounded-full border-2',
    completed
      ? 'border-success bg-success'
      : isNext
        ? 'border-primary bg-primary/10'
        : 'border-muted-foreground/40',
  );
  const toggleIconColor = completed ? 'success-foreground' : isNext ? 'primary' : 'muted-foreground';

  const row = (
    <View
      style={{ height: SET_ROW_HEIGHT }}
      className={cn(
        'flex-row items-center gap-2 rounded-xl bg-background px-1',
        completed && 'bg-success/8',
      )}>
      <Pressable
        style={({ pressed }) => [{ width: SET_COL.index, opacity: pressed ? 0.55 : 1 }]}
        className="items-center justify-center self-stretch"
        disabled={!onOpenSetType}
        onPress={onOpenSetType}
        android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: false }}
        accessibilityRole={onOpenSetType ? 'button' : undefined}
        accessibilityLabel={onOpenSetType ? `Set ${index + 1} type: ${SET_TYPE_LABEL[setType]}. Activate to change.` : undefined}
        hitSlop={6}>
        <Text className="text-sm font-bold text-foreground">{index + 1}</Text>
        {setType !== 'working' ? (
          <Text className={cn('text-[9px] font-bold leading-none', SET_TYPE_LETTER_COLOR[setType])}>
            {SET_TYPE_LETTER[setType]}
          </Text>
        ) : null}
      </Pressable>

      <Pressable
        style={({ pressed }) => [{ flex: SET_FLEX.prev, opacity: pressed ? 0.55 : 1 }]}
        className="items-center justify-center"
        disabled={!hasPrevious || !onApplyPrevious}
        onPress={() => {
          selection();
          onApplyPrevious?.();
        }}
        android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}
        accessibilityRole={hasPrevious ? 'button' : undefined}
        accessibilityLabel={
          hasPrevious
            ? `Use previous ${formatWeight(previousWeight!, unit)} times ${previousReps ?? 0}`
            : undefined
        }
        hitSlop={6}>
        {hasPrevious ? (
          <Text className="text-center text-xs text-muted-foreground" numberOfLines={2}>
            {formatWeight(previousWeight!, unit)}×{previousReps}
          </Text>
        ) : (
          <Text className="text-xs text-muted-foreground">—</Text>
        )}
      </Pressable>

      <NumberStepper
        ref={weightRef}
        value={weight}
        onChange={onChangeWeight}
        decimals={1}
        label={`Weight, set ${index + 1}`}
        style={{ flex: SET_FLEX.input }}
        onSubmitNext={() => repsRef.current?.focus()}
      />
      <NumberStepper
        ref={repsRef}
        value={reps}
        onChange={onChangeReps}
        label={`Reps, set ${index + 1}`}
        style={{ flex: SET_FLEX.input }}
        onSubmitNext={onSubmitReps}
      />

      <View style={{ width: SET_COL.done }} className="items-center justify-center self-stretch">
        {onToggleComplete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={completed ? 'Mark incomplete' : 'Complete set'}
            accessibilityState={{ checked: completed }}
            onPress={() => {
              if (completed) {
                impact(Haptics.ImpactFeedbackStyle.Light);
              } else {
                impact(Haptics.ImpactFeedbackStyle.Medium);
              }
              if (!completed) notify(Haptics.NotificationFeedbackType.Success);
              onToggleComplete();
            }}
            hitSlop={8}
            className={toggleClass}>
            <Icon icon={Check} size={18} color={toggleIconColor} />
          </Pressable>
        ) : (
          <View className={toggleClass}>
            {completed ? <Icon icon={Check} size={18} color="success-foreground" /> : null}
          </View>
        )}
      </View>
    </View>
  );

  if (!onRemove) return row;

  return (
    <Swipeable
      ref={swipeRef}
      friction={1}
      rightThreshold={48}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          onPress={() => {
            notify(Haptics.NotificationFeedbackType.Warning);
            swipeRef.current?.close();
            onRemove();
          }}
          accessibilityRole="button"
          accessibilityLabel="Delete set"
          className="w-[72px] items-center justify-center bg-destructive">
          <Icon icon={Trash2} size={18} color="destructive-foreground" />
        </Pressable>
      )}>
      {row}
    </Swipeable>
  );
}
