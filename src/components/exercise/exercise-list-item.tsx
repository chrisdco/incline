import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';
import { EQUIPMENT_LABELS, MOVEMENT_LABELS } from '@/lib/labels';
import type { Exercise } from '@/db/types';
import { MuscleBadge } from './muscle-badge';
import { ExerciseThumb } from './exercise-media';

/** Exercise row used in the library list and search results. */
export function ExerciseListItem({ exercise, className }: { exercise: Exercise; className?: string }) {
  const router = useRouter();
  return (
    <Pressable
      className={cn('flex-row items-center gap-3 rounded-3xl bg-card p-4', className)}
      onPress={() => router.push(`/exercise/${exercise.id}`)}
      style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}>
      <ExerciseThumb name={exercise.name} aliases={exercise.aliases} imageUrl={exercise.imageUrl} size={44} />
      <View className="flex-1">
        <Text className="text-base font-semibold text-foreground">{exercise.name}</Text>
        <Text className="mt-0.5 text-xs text-muted-foreground">
          {EQUIPMENT_LABELS[exercise.equipment as keyof typeof EQUIPMENT_LABELS] ?? exercise.equipment}{exercise.movementPattern ? ` · ${MOVEMENT_LABELS[exercise.movementPattern as keyof typeof MOVEMENT_LABELS] ?? exercise.movementPattern}` : ''}
        </Text>
      </View>
      <MuscleBadge muscle={exercise.primaryMuscle} />
    </Pressable>
  );
}
