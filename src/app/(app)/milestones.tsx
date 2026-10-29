import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from '@/components/common/styled';
import { ArrowLeft } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { EmptyState } from '@/components/common/states';
import { AchievementTile } from '@/components/profile/achievement-tile';
import { useProgressStats } from '@/hooks/use-data';
import { evaluateAchievements } from '@/lib/achievements';
import { SCREEN_CONTENT } from '@/lib/layout';

export default function MilestonesScreen() {
  const router = useRouter();
  const { data: stats } = useProgressStats();
  const achievements = evaluateAchievements(stats);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <Body className="text-base font-semibold text-foreground">Milestones</Body>
        <View className="w-8" />
      </View>

      <ScrollView contentContainerStyle={SCREEN_CONTENT} showsVerticalScrollIndicator={false}>
        <Caption className="mb-4">
          {unlockedCount}/{achievements.length} unlocked
        </Caption>
        {achievements.length === 0 ? (
          <EmptyState title="No milestones yet" description="Log workouts to unlock badges." />
        ) : (
          <View className="flex-row flex-wrap gap-3">
            {achievements.map((a) => (
              <AchievementTile key={a.id} achievement={a} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
