import { useImperativeHandle, useRef, type Ref } from 'react';
import { Pressable, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';
import { Icon } from '@/components/common/icon';
import { Check, Trash2 } from 'lucide-react-native';
import { NumberStepper, type NumberStepperHandle } from './number-stepper';
import { SET_COL, SET_ROW_HEIGHT } from './set-layout';
import { formatWeight } from '@/db/calc';
import type { Unit } from '@/db/types';

export interface SetRowHandle {
  focusWeight: () => void;
}

/** A single set row: index, previous, weight, reps, and a complete toggle. */
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
  onChangeWeight,
  onChangeReps,
  onApplyPrevious,
  onToggleComplete,
  onRemove,
  onSubmitReps,
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
  onChangeWeight: (v: number) => void;
  onChangeReps: (v: number) => void;
  onApplyPrevious?: () => void;
  onToggleComplete?: () => void;
  onRemove?: () => void;
  onSubmitReps?: () => void;
}) {
  const weightRef = useRef<NumberStepperHandle>(null);
  const repsRef = useRef<NumberStepperHandle>(null);
  const swipeRef = useRef<Swipeable>(null);

  useImperativeHandle(ref, () => ({ focusWeight: () => weightRef.current?.focus() }), []);

  const hasPrevious = previousWeight !== undefined && previousWeight > 0;

  const toggleClass = cn(
    'h-11 w-11 items-center justify-center rounded-full',
    completed ? 'bg-success' : isNext ? 'border-2 border-primary bg-primary/10' : 'border-2 border-border',
  );
  const toggleIconColor = completed ? 'success-foreground' : isNext ? 'primary' : 'muted-foreground';

  const row = (
    <View
      style={{ height: SET_ROW_HEIGHT }}
      className={cn(
        'flex-row items-center gap-2 rounded-xl bg-background px-1',
        completed && 'bg-success/8',
      )}>
      <View style={{ width: SET_COL.index }} className="items-center">
        <Text className="text-sm font-bold text-muted-foreground">{index + 1}</Text>
      </View>

      <Pressable
        style={{ width: SET_COL.prev }}
        className="items-center justify-center"
        disabled={!hasPrevious || !onApplyPrevious}
        onPress={onApplyPrevious}
        accessibilityRole={hasPrevious ? 'button' : undefined}
        accessibilityLabel={hasPrevious ? 'Use previous weight and reps' : undefined}
        hitSlop={6}>
        {hasPrevious ? (
          <Text className="text-center text-xs text-primary" numberOfLines={1}>
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
        style={{ width: SET_COL.weight }}
        onSubmitNext={() => repsRef.current?.focus()}
      />
      <NumberStepper
        ref={repsRef}
        value={reps}
        onChange={onChangeReps}
        style={{ width: SET_COL.reps }}
        onSubmitNext={onSubmitReps}
      />

      <View className="flex-1" />

      <View style={{ width: SET_COL.done }} className="items-center">
        {onToggleComplete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={completed ? 'Mark incomplete' : 'Complete set'}
            accessibilityState={{ checked: completed }}
            onPress={onToggleComplete}
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
      friction={2}
      rightThreshold={48}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          onPress={() => {
            swipeRef.current?.close();
            onRemove();
          }}
          accessibilityRole="button"
          accessibilityLabel="Delete set"
          className="w-[72px] items-center justify-center rounded-xl bg-destructive">
          <Icon icon={Trash2} size={18} color="destructive-foreground" />
        </Pressable>
      )}>
      {row}
    </Swipeable>
  );
}
