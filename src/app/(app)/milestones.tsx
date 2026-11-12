import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';

import { IconButton } from '@/components/ui/icon-button';
import { Body, Caption } from '@/components/common/text';
import { EmptyState } from '@/components/common/states';
import { AchievementTile } from '@/components/profile/achievement-tile';
import { useProgressStats } from '@/hooks/use-data';
import { evaluateAchievements } from '@/lib/achievements';
import { SCREEN_CONTENT } from '@/lib/layout';
import { useSettings } from '@/store/settings-store';

export default function MilestonesScreen() {
  const router = useRouter();
  const { data: stats } = useProgressStats();
  const unit = useSettings((s) => s.unit);
  const achievements = evaluateAchievements(stats, unit);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <IconButton icon={ArrowLeft} accessibilityLabel="Go back" onPress={() => router.back()} className="-my-1.5 -ml-2" />
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
