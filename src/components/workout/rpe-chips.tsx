import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';
import { Text } from '@/components/common/text';
import { normalizeRpe } from '@/coaching/rpe';

const PRIMARY = [6, 7, 8, 9, 10] as const;
const LOW = [1, 2, 3, 4, 5] as const;

/**
 * Compact optional RPE after a completed working set.
 * Tap the selected chip again to clear. Never blocks set completion.
 */
export function RpeChips({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const selected = normalizeRpe(value);
  const [showLow, setShowLow] = useState(() => selected != null && selected < 6);
  const expanded = showLow || (selected != null && selected < 6);
  const chips = expanded ? [...LOW, ...PRIMARY] : [...PRIMARY];

  const toggle = (n: number) => {
    onChange(selected === n ? null : n);
  };

  return (
    <View className="flex-row flex-wrap items-center gap-1 px-1 pb-1">
      <Text className="mr-0.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        RPE
      </Text>
      {chips.map((n) => {
        const isOn = selected === n;
        return (
          <Pressable
            key={n}
            onPress={() => toggle(n)}
            accessibilityRole="button"
            accessibilityLabel={isOn ? `Clear RPE ${n}` : `Set RPE ${n}`}
            accessibilityState={{ selected: isOn }}
            hitSlop={4}
            className={cn(
              'h-7 min-w-7 items-center justify-center rounded-full border px-2',
              isOn ? 'border-primary bg-primary' : 'border-border/70 bg-transparent',
            )}>
            <Text className={cn('text-xs font-semibold', isOn ? 'text-primary-foreground' : 'text-muted-foreground')}>
              {n}
            </Text>
          </Pressable>
        );
      })}
      {!expanded ? (
        <Pressable
          onPress={() => setShowLow(true)}
          accessibilityRole="button"
          accessibilityLabel="Show RPE 1 to 5"
          hitSlop={4}
          className="h-7 items-center justify-center rounded-full border border-border/70 px-2">
          <Text className="text-2xs font-medium text-muted-foreground">1–5</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
