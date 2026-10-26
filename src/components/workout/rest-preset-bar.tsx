import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';
import { Text } from '@/components/common/text';
import { REST_PRESETS } from '@/constants/rest-presets';

/** Quick-pick rest duration chips shown alongside the running timer. */
export function RestPresetBar({
  onSelect,
  className,
}: {
  onSelect: (seconds: number) => void;
  className?: string;
}) {
  return (
    <View className={cn('flex-row gap-2', className)}>
      {REST_PRESETS.map((p) => (
        <Pressable
          key={p.seconds}
          onPress={() => onSelect(p.seconds)}
          className="flex-1 items-center justify-center rounded-full bg-muted py-2"
          accessibilityRole="button"
          accessibilityLabel={`Rest ${p.label}`}>
          <Text className="text-sm font-medium text-foreground">{p.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
