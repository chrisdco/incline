import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { cn } from '@/lib/cn';

export function Progress({
  value,
  className,
  indicatorClass,
}: {
  value: number;
  className?: string;
  indicatorClass?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = useSharedValue(pct / 100);
  const rowW = useSharedValue(0);

  useEffect(() => {
    fill.value = withTiming(pct / 100, { duration: 320 });
  }, [pct, fill]);

  // GPU-only fill (see rest-timer): scaleX instead of width %.
  const fillStyle = useAnimatedStyle(() => {
    const cw = Math.max(rowW.value, 1);
    const s = Math.max(0, Math.min(1, fill.value));
    return {
      transform: [{ translateX: ((s - 1) * cw) / 2 }, { scaleX: Math.max(s, 0.001) }],
    };
  });

  return (
    <View
      className={cn('h-2.5 w-full overflow-hidden rounded-full bg-muted', className)}
      onLayout={(e) => {
        rowW.value = e.nativeEvent.layout.width;
      }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}>
      <Animated.View className={cn('h-full w-full rounded-full bg-primary', indicatorClass)} style={fillStyle} />
    </View>
  );
}
