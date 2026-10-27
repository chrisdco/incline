import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { formatClock } from '@/db/calc';
import { Text } from '@/components/common/text';
import { cn } from '@/lib/cn';
import { useHaptics } from '@/hooks/use-haptics';
import * as Haptics from 'expo-haptics';
import { useRestTimerStore } from '@/store/rest-timer-store';

/**
 * RestTimer bound to the rest-timer store. The only subscriber to the 1s
 * `remaining` tick, so the session tree above it stays still during rest.
 */
export function RestTimerBar(props: {
  onAdd: (delta: number) => void;
  onSkip: () => void;
  caption?: string;
  /** In a layout host (SessionDock) instead of absolutely pinned. */
  docked?: boolean;
}) {
  const remaining = useRestTimerStore((s) => s.remaining);
  const total = useRestTimerStore((s) => s.total);
  return <RestTimer remaining={remaining} total={total} {...props} />;
}

/**
 * Compact rest-timer bar shown at the bottom of the session screen.
 * Displays: [-15] [time] [+15] [Skip] with a progressive fill.
 */
export function RestTimer({
  remaining,
  total,
  onAdd,
  onSkip,
  caption,
  docked = false,
}: {
  remaining: number;
  total: number;
  onAdd: (delta: number) => void;
  onSkip: () => void;
  caption?: string;
  docked?: boolean;
}) {
  const done = remaining <= 0 && total > 0;
  const progress = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const fill = useSharedValue(progress);
  const rowW = useSharedValue(0);
  // Amber bar for the last 10s, but only tick haptics on the final 3 seconds —
  // 10 vibrations read as noise instead of a cue.
  const urgent = remaining > 0 && remaining <= 10;
  const finalTicks = remaining > 0 && remaining <= 3;
  const { impact, selection } = useHaptics();

  useEffect(() => {
    fill.set(withTiming(progress, { duration: 250 }));
  }, [fill, progress]);

  // Light tick on each of the last three seconds.
  useEffect(() => {
    if (finalTicks && !done) {
      selection();
    }
  }, [remaining, finalTicks, done, selection]);

  // GPU-only fill: scaleX about the left edge (via center-origin compensation)
  // instead of width %, which re-lays-out every frame of the 250ms tick.
  const fillStyle = useAnimatedStyle(() => {
    const cw = Math.max(rowW.value, 1);
    const s = Math.max(0, Math.min(1, fill.value));
    return {
      transform: [{ translateX: ((s - 1) * cw) / 2 }, { scaleX: Math.max(s, 0.001) }],
    };
  });

  return (
    <View
      className={cn(
        docked ? undefined : 'absolute inset-x-0 bottom-0 z-30',
        'border-t border-border bg-background px-4 py-3 pb-6',
      )}
      style={{ boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.25)' }}>
      <View
        onLayout={(e) => {
          rowW.set(e.nativeEvent.layout.width);
        }}
        className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <Animated.View
          className={cn('h-full w-full rounded-full', urgent ? 'bg-warning' : 'bg-primary')}
          style={fillStyle}
        />
      </View>
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => {
            selection();
            onAdd(-15);
          }}
          accessibilityRole="button"
          accessibilityLabel="Subtract 15 seconds"
          className="h-11 w-14 items-center justify-center rounded-xl bg-muted">
          <Text className="text-lg font-semibold text-foreground">-15</Text>
        </Pressable>

        <View className="items-center px-4">
          {caption ? (
            <Text className="mb-0.5 text-2xs font-medium text-primary">{caption}</Text>
          ) : null}
          <Text className="text-2xl font-bold tracking-tight text-foreground">
            {formatClock(remaining)}
          </Text>
          <Text className="text-2xs text-muted-foreground">
            {done ? 'Done' : 'remaining'}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            selection();
            onAdd(15);
          }}
          accessibilityRole="button"
          accessibilityLabel="Add 15 seconds"
          className="h-11 w-14 items-center justify-center rounded-xl bg-muted">
          <Text className="text-lg font-semibold text-foreground">+15</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            impact(Haptics.ImpactFeedbackStyle.Medium);
            onSkip();
          }}
          accessibilityRole="button"
          accessibilityLabel="Skip rest"
          className="h-11 items-center justify-center rounded-xl bg-primary px-4">
          <Text className="text-sm font-semibold text-primary-foreground">Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}
