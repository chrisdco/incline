import { Pressable, View } from 'react-native';
import { TrendingUp } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { cn } from '@/lib/cn';
import { Icon } from '@/components/common/icon';
import { Text } from '@/components/common/text';
import { Card } from '@/components/ui/card';
import { formatWeight, relativeTime } from '@/db/calc';
import { formatCelebrationKinds } from '@/coaching/pr';
import type { PR, Unit } from '@/db/types';

/** A personal-record row: exercise, max weight, estimated 1RM, when achieved. */
export function PRCard({ pr, unit, className }: { pr: PR; unit: Unit; className?: string }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/exercise/${pr.exerciseId}`)}>
      <Card className={cn('flex-row items-center gap-3 p-3', className)}>
        <View className="h-10 w-10 items-center justify-center rounded-3xl bg-muted">
          <Icon icon={TrendingUp} size={18} color="muted-foreground" />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-foreground">{pr.exerciseName}</Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {pr.kinds?.length
              ? `${formatWeight(pr.maxWeight, unit)} × ${pr.maxReps} · ${formatCelebrationKinds(pr.kinds, pr.maxReps)}`
              : `Best ${formatWeight(pr.maxWeight, unit)} · e1RM ${formatWeight(pr.estimated1RM, unit)}`}
          </Text>
        </View>
        <Text className="text-xs text-muted-foreground">
          {pr.achievedAt ? relativeTime(pr.achievedAt) : '—'}
        </Text>
      </Card>
    </Pressable>
  );
}
