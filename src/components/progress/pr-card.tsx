import { Pressable, View } from 'react-native';
import { TrendingUp } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { cn } from '@/lib/cn';
import { Icon } from '@/components/common/icon';
import { Text } from '@/components/common/text';
import { formatWeight, relativeTime } from '@/db/calc';
import { formatCelebrationKinds } from '@/coaching/pr';
import type { PR, Unit } from '@/db/types';

/**
 * A personal-record row: exercise + record kind left, the lift itself right
 * (summary first), when achieved under it. Flat — wrap a run of these in
 * `<ListGroup>` (SYSTEM.md §2). The ↗ mark is the record glyph (§4).
 */
export function PRCard({ pr, unit, className }: { pr: PR; unit: Unit; className?: string }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/exercise/${pr.exerciseId}`)}
      accessibilityRole="button"
      className={cn('flex-row items-center gap-3 py-3 active:opacity-70', className)}>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Icon icon={TrendingUp} size={14} color="primary" />
          <Text className="flex-1 text-base font-medium text-foreground" numberOfLines={1}>
            {pr.exerciseName}
          </Text>
        </View>
        <Text className="mt-0.5 text-sm text-muted-foreground" numberOfLines={1}>
          {pr.kinds?.length
            ? formatCelebrationKinds(pr.kinds, pr.maxReps)
            : `e1RM ${formatWeight(pr.estimated1RM, unit)}`}
        </Text>
      </View>
      <View className="items-end">
        <Text className="text-base font-semibold tabular-nums text-foreground">
          {formatWeight(pr.maxWeight, unit)} × {pr.maxReps}
        </Text>
        <Text className="mt-0.5 text-sm text-muted-foreground">
          {pr.achievedAt ? relativeTime(pr.achievedAt) : '—'}
        </Text>
      </View>
    </Pressable>
  );
}
