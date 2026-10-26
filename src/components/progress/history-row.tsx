import { View } from 'react-native';
import { Dumbbell, Clock, Weight } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { cn } from '@/lib/cn';
import { Icon } from '@/components/common/icon';
import { Text } from '@/components/common/text';
import { PressableCard } from '@/components/ui/card';
import { formatDuration, formatFullDate, formatVolume } from '@/db/calc';
import type { Unit, WorkoutLog } from '@/db/types';

/** A completed workout row in the history list. */
export function HistoryRow({ log, unit, className, onLongPress }: { log: WorkoutLog; unit: Unit; className?: string; onLongPress?: () => void }) {
  const router = useRouter();
  return (
    <PressableCard
      className={cn('flex-row items-center gap-3 rounded-xl border-0 bg-card/50 p-0 px-3 py-2.5', className)}
      onPress={() => router.push(`/summary/${log.id}`)}
      onLongPress={onLongPress}
      accessibilityLabel={`Open ${log.name} summary`}>
      <View className="h-11 w-11 items-center justify-center rounded-3xl bg-muted">
        <Icon icon={Dumbbell} size={18} color="muted-foreground" />
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-foreground">{log.name}</Text>
        <Text className="mt-0.5 text-xs text-muted-foreground">{formatFullDate(log.startedAt)}</Text>
      </View>
      <View className="items-end gap-1">
        <View className="flex-row items-center gap-1">
          <Icon icon={Weight} size={12} color="muted-foreground" />
          <Text className="text-xs font-medium text-foreground">{formatVolume(log.totalVolume, unit)}</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Icon icon={Clock} size={12} color="muted-foreground" />
          <Text className="text-xs text-muted-foreground">{formatDuration(log.durationSeconds)}</Text>
        </View>
      </View>
    </PressableCard>
  );
}
