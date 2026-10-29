import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from '@/components/common/styled';
import { ArrowLeft } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Body } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { PlateCalculator } from '@/components/workout/plate-calculator';
import { SCREEN_CONTENT } from '@/lib/layout';

export default function PlateCalculatorScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <Body className="text-base font-semibold text-foreground">Plate Calculator</Body>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ ...SCREEN_CONTENT, paddingBottom: 40 }}>
        <PlateCalculator className="mt-2" />
        <Button variant="outline" className="mt-6" onPress={() => router.back()}>
          Done
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
