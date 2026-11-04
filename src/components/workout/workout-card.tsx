import { Pressable, View } from 'react-native';
import { Clock, Dumbbell, MoreHorizontal, Play } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { Icon } from '@/components/common/icon';
import { Text } from '@/components/common/text';
import { Card, PressableCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DIFFICULTY_LABELS } from '@/lib/labels';
import { METRIC_ICONS } from '@/lib/metric-icons';
import { MuscleBadge } from '@/components/exercise/muscle-badge';
import type { Difficulty, MuscleGroup } from '@/db/types';

/**
 * Routine card used on the Workouts library. Tapping the body navigates to the
 * routine detail; when `onStart`/`onMenuPress` are provided, a "Start Routine"
 * button and a three-dot menu are rendered.
 */
export function WorkoutCard({
  id,
  name,
  description,
  difficulty,
  estimatedMinutes,
  exerciseCount,
  muscleFocus,
  exerciseNames = [],
  onStart,
  onMenuPress,
  className,
}: {
  id: number;
  name: string;
  description: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  exerciseCount: number;
  muscleFocus: MuscleGroup[];
  exerciseNames?: string[];
  onStart?: () => void;
  onMenuPress?: () => void;
  className?: string;
}) {
  const router = useRouter();
  return (
    <Card className={className}>
      <PressableCard
        className="border-0 border-transparent bg-transparent p-0 shadow-none"
        onPress={() => router.push(`/workout/${id}`)}
        accessibilityLabel={`Open ${name} routine`}>
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">{name}</Text>
            <Text className="mt-1 text-sm text-muted-foreground" numberOfLines={2}>
              {description}
            </Text>
          </View>
          {onMenuPress ? (
            <Pressable
              onPress={onMenuPress}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`More options for ${name}`}
              className="h-11 w-11 items-center justify-center rounded-xl">
              <Icon icon={MoreHorizontal} size={20} color="muted-foreground" />
            </Pressable>
          ) : (
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <Icon icon={Dumbbell} size={18} color="muted-foreground" />
            </View>
          )}
        </View>

        <View className="mt-3 flex-row items-center gap-4">
          <View className="flex-row items-center gap-1.5">
            <Icon icon={METRIC_ICONS.sets} size={14} color="muted-foreground" />
            <Text className="text-xs text-muted-foreground">{exerciseCount} exercises</Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Icon icon={Clock} size={14} color="muted-foreground" />
            <Text className="text-xs text-muted-foreground">{estimatedMinutes} min</Text>
          </View>
          <Text className="text-xs text-muted-foreground">· {DIFFICULTY_LABELS[difficulty]}</Text>
        </View>

        {muscleFocus.length > 0 || exerciseNames.length > 0 ? (
          <View className="mt-3 gap-2">
            {muscleFocus.length > 0 ? (
              <View className="flex-row flex-wrap items-center gap-1.5">
                {muscleFocus.slice(0, 3).map((m) => (
                  <MuscleBadge key={m} muscle={m} />
                ))}
                {muscleFocus.length > 3 ? (
                  <Text className="text-xs text-muted-foreground">+{muscleFocus.length - 3}</Text>
                ) : null}
              </View>
            ) : null}
            {exerciseNames.length > 0 ? (
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {exerciseNames.slice(0, 3).join(' · ')}
                {exerciseNames.length > 3 ? ` · +${exerciseNames.length - 3} more` : ''}
              </Text>
            ) : null}
          </View>
        ) : null}
      </PressableCard>

      {onStart ? (
        // Neutral, not tonal: this repeats on every card, so the accent is
        // left to the screen's one primary action (SYSTEM.md §1, 60/30/10).
        <Button
          className="mt-3"
          size="sm"
          variant="secondary"
          leftIcon={<Icon icon={Play} size={14} color="secondary-foreground" />}
          onPress={onStart}>
          Start routine
        </Button>
      ) : null}
    </Card>
  );
}
