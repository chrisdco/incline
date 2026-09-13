import { History } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';
import { Icon } from '@/components/common/icon';
import { Text } from '@/components/ui/text';
import { formatWeight } from '@/db/calc';
import type { SetEntry, Unit } from '@/db/types';

/** Shows the carry-over values from the last completed workout for an exercise. */
export function PreviousBestBadge({
  lastSets,
  unit,
  onPress,
  className,
}: {
  lastSets: SetEntry[];
  unit: Unit;
  /** When provided, the badge opens exercise targets/shortcuts. */
  onPress?: () => void;
  className?: string;
}) {
  if (lastSets.length === 0) return null;
  const top = lastSets.reduce((best, s) => (s.weight > best.weight ? s : best), lastSets[0]);
  const inner = (
    <View className={cn('flex-row items-center gap-1.5', className)}>
      <Icon icon={History} size={13} color="muted-foreground" />
      <Text className="text-xs text-muted-foreground">
        Last: {formatWeight(top.weight, unit)} × {top.reps}
      </Text>
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Exercise targets and shortcuts">
      {inner}
    </Pressable>
  );
}
