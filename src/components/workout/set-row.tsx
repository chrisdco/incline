import { useImperativeHandle, useRef, type Ref } from 'react';
import { Pressable, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { cn } from '@/lib/cn';
import { Text } from '@/components/common/text';
import { Icon } from '@/components/common/icon';
import { Check, Trash2 } from 'lucide-react-native';
import { useHaptics } from '@/hooks/use-haptics';
import * as Haptics from 'expo-haptics';
import { NumberStepper, type NumberStepperHandle } from './number-stepper';
import { SET_CELL, SET_ROW_HEIGHT } from './set-layout';
import { formatWeight } from '@/db/calc';
import { commitInputToKg, kgToInput } from '@/lib/units';
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
 * Reference anatomy (Hevy Sep 30 shot — do not regress): fixed number +
 * tick at the edges; PREV dim text flexes widest (full "36.29kg×10"
 * centered, never a box); KG/REPS share the rest equally. Uniform gaps,
 * tick snug. Locked to set-layout.ts proportions — device screenshot
 * required before any geometry change. Row edges stay square: a rounded
 * row lets the red swipe-delete action show at its corners. The row has an
 * opaque base under the translucent completed tint for the same reason.
 * RPE: one inline prompt for the set just finished, then "@8" under the set
 * number; edit from the set menu (tap the number).
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
  rpe = null,
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
  /** Shown as "@8" under the set number; edited from the set menu. */
  rpe?: number | null;
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
  const swipeRef = useRef<SwipeableMethods>(null);

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

  // Opaque outer layer: the completed tint is translucent, and the red
  // swipe-delete action sits underneath the row.
  const row = (
    <View className="w-full bg-background">
    <View
      style={{ height: SET_ROW_HEIGHT }}
      className={cn('w-full flex-row items-center gap-2 px-1', completed && 'bg-success/8')}>
      {/* Layout lives on plain Views: NativeWind drops a Pressable's style
          *function* when className is also set, so widths given there never
          applied and SET/PREV collapsed to their text (Oct 29 screenshots). */}
      <View style={SET_CELL.index} className="self-stretch">
      <Pressable
        style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
        className="flex-1 items-center justify-center"
        disabled={!onOpenSetType}
        onPress={onOpenSetType}
        android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: false }}
        accessibilityRole={onOpenSetType ? 'button' : undefined}
        accessibilityLabel={onOpenSetType ? `Set ${index + 1}: ${SET_TYPE_LABEL[setType]}${rpe != null ? `, RPE ${rpe}` : ''}. Activate to change type or RPE.` : undefined}
        hitSlop={6}>
        <Text className="text-sm font-bold text-foreground">{index + 1}</Text>
        {rpe != null && setType !== 'warmup' ? (
          // eslint-disable-next-line no-restricted-syntax -- RPE tag sits under the 14pt set number inside a fixed-width cell
          <Text className="text-[9px] font-semibold leading-none text-muted-foreground">@{rpe}</Text>
        ) : setType !== 'working' ? (
          // eslint-disable-next-line no-restricted-syntax -- set-type letter sits under the 14pt set number inside a fixed-width cell
          <Text className={cn('text-[9px] font-bold leading-none', SET_TYPE_LETTER_COLOR[setType])}>
            {SET_TYPE_LETTER[setType]}
          </Text>
        ) : null}
      </Pressable>
      </View>

      <View style={SET_CELL.prev} className="self-stretch">
      <Pressable
        style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
        className="flex-1 items-center justify-center"
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
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={{ textAlign: 'center', fontSize: 12 }}
            className="text-muted-foreground">
            {formatWeight(previousWeight!, unit)}×{previousReps}
          </Text>
        ) : (
          <Text className="text-xs text-muted-foreground">—</Text>
        )}
      </Pressable>
      </View>

      <NumberStepper
        ref={weightRef}
        value={kgToInput(weight, unit)}
        onChange={(v) => {
          // `weight` is canonical kg; the field edits in the display unit.
          const kg = commitInputToKg(v, weight, unit);
          if (kg != null) onChangeWeight(kg);
        }}
        decimals={2}
        label={`Weight, set ${index + 1}`}
        style={SET_CELL.input}
        onSubmitNext={() => repsRef.current?.focus()}
      />
      <NumberStepper
        ref={repsRef}
        value={reps}
        onChange={onChangeReps}
        label={`Reps, set ${index + 1}`}
        style={SET_CELL.input}
        onSubmitNext={onSubmitReps}
      />

      <View style={SET_CELL.done} className="items-center">
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
    </View>
  );

  if (!onRemove) return row;

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      // Full width, or the swipe wrapper sizes the row to its content and
      // PREV collapses: KG/REPS/DONE then sit left of their headers.
      containerStyle={{ width: '100%' }}
      childrenContainerStyle={{ width: '100%' }}
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
    </ReanimatedSwipeable>
  );
}
