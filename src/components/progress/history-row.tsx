import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { cn } from '@/lib/cn';
import { Text } from '@/components/common/text';
import { Num, splitUnit } from '@/components/layout';
import { formatDuration, formatFullDate, formatVolume } from '@/db/calc';
import type { Unit, WorkoutLog } from '@/db/types';

/**
 * A completed workout row in the history list. Flat, one line per side:
 * name + date left, volume (value, muted unit) + duration right. The list
 * draws hairlines between rows (SYSTEM.md §2 — no card per row, no
 * identical icon per row).
 */
export function HistoryRow({ log, unit, className, onLongPress }: { log: WorkoutLog; unit: Unit; className?: string; onLongPress?: () => void }) {
  const router = useRouter();
  const [volume, volumeUnit] = splitUnit(formatVolume(log.totalVolume, unit));
  return (
    <Pressable
      className={cn('flex-row items-center gap-3 py-3 active:opacity-70', className)}
      onPress={() => router.push(`/summary/${log.id}`)}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${log.name} summary`}>
      <View className="min-w-0 flex-1">
        <Text className="text-base font-medium text-foreground" numberOfLines={1}>{log.name}</Text>
        <Text className="mt-0.5 text-sm text-muted-foreground">{formatFullDate(log.startedAt)}</Text>
      </View>
      <View className="items-end">
        <Num value={volume} unit={volumeUnit} className="text-base font-semibold" unitClassName="text-xs" />
        <Text className="mt-0.5 text-sm tabular-nums text-muted-foreground">{formatDuration(log.durationSeconds)}</Text>
      </View>
    </Pressable>
  );
}
