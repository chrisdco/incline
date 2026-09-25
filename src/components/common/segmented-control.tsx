import { Pressable, View, LayoutChangeEvent } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';

/**
 * Custom segmented control with animated sliding indicator.
 */
export function SegmentedControl<T extends string>({
  values,
  value,
  onChange,
  className,
}: {
  values: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const selectedIndex = Math.max(0, values.findIndex((v) => v.value === value));
  const [widths, setWidths] = useState<number[]>(values.map(() => 0));
  const [offsets, setOffsets] = useState<number[]>(values.map(() => 0));

  const indicatorX = useSharedValue(0);
  const selectedWidth = widths[selectedIndex] ?? 0;

  const onLayout = (index: number, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setWidths((prev) => {
      const next = [...prev];
      next[index] = width;
      return next;
    });
    setOffsets((prev) => {
      const next = [...prev];
      next[index] = x;
      return next;
    });
  };

  useEffect(() => {
    const x = offsets[selectedIndex] ?? 0;
    if (selectedWidth <= 0) return;
    indicatorX.value = withSpring(x, { damping: 40, stiffness: 150 });
  }, [selectedIndex, selectedWidth, offsets, indicatorX]);

  // translateX glides on the GPU; width applies instantly (one layout per tap)
  // instead of animating width every frame.
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  return (
    <View className={cn('relative flex-row rounded-xl border border-border bg-muted/60 p-1', className)}>
      <Animated.View
        className="absolute top-1 bottom-1 rounded-lg border border-primary/35 bg-primary/15"
        style={[indicatorStyle, { left: 0, width: Math.max(selectedWidth, 0) }]}
      />
      {values.map((v, i) => {
        const isSelected = v.value === value;
        return (
          <Pressable
            key={v.value}
            onPress={() => onChange(v.value)}
            onLayout={(e) => onLayout(i, e)}
            className="flex-1 items-center justify-center py-2"
            style={{ minHeight: 36, zIndex: 1 }}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}>
            <Text
              className={cn(
                'text-sm font-semibold',
                isSelected ? 'text-primary' : 'text-muted-foreground',
              )}>
              {v.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
