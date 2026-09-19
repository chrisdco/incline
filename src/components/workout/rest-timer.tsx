import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { formatClock } from '@/db/calc';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { useHaptics } from '@/hooks/use-haptics';
import * as Haptics from 'expo-haptics';

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
}: {
  remaining: number;
  total: number;
  onAdd: (delta: number) => void;
  onSkip: () => void;
  caption?: string;
}) {
  const done = remaining <= 0 && total > 0;
  const progress = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const fill = useSharedValue(progress);
  // Amber bar for the last 10s, but only tick haptics on the final 3 seconds —
  // 10 vibrations read as noise instead of a cue.
  const urgent = remaining > 0 && remaining <= 10;
  const finalTicks = remaining > 0 && remaining <= 3;
  const { impact, selection } = useHaptics();

  useEffect(() => {
    fill.value = withTiming(progress, { duration: 250 });
  }, [fill, progress]);

  // Light tick on each of the last three seconds.
  useEffect(() => {
    if (finalTicks && !done) {
      selection();
    }
  }, [remaining, finalTicks, done, selection]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%`,
  }));

  return (
    <View
      className="absolute inset-x-0 bottom-0 z-30 border-t border-border bg-background px-4 py-3 pb-6"
      style={{ elevation: 12 }}>
      <View className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <Animated.View
          className={cn('h-full rounded-full', urgent ? 'bg-warning' : 'bg-primary')}
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
            <Text className="mb-0.5 text-[10px] font-medium text-primary">{caption}</Text>
          ) : null}
          <Text className="text-2xl font-bold tracking-tight text-foreground">
            {formatClock(remaining)}
          </Text>
          <Text className="text-[10px] text-muted-foreground">
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
