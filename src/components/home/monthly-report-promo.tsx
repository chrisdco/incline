import { memo } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CalendarRange } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Caption, Title } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { HomeContextCard } from '@/lib/home-context';

/** Home hero for last month’s recap — View / Dismiss, Hevy-style. */
export const MonthlyReportPromo = memo(function MonthlyReportPromo({
  card,
  onDismiss,
  index = 0,
}: {
  card: HomeContextCard;
  onDismiss?: (id: string) => void;
  index?: number;
}) {
  const router = useRouter();

  return (
    <Animated.View entering={FadeInDown.duration(220).delay(index * 40)}>
      <Card elevation="raised" className="overflow-hidden">
        {/* Animation slot: replace this icon well with a Lottie/report animation. */}
        <View className="items-center pt-2">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-primary/15">
            <Icon icon={CalendarRange} size={30} color="primary" />
          </View>
        </View>
        <Title className="mt-3 text-center">{card.title}</Title>
        <Caption className="mt-1 text-center">{card.subtitle}</Caption>
        <View className="mt-4 flex-row gap-2">
          {card.href ? (
            <Button
              size="sm"
              className="flex-1"
              onPress={() => router.push(card.href as Href)}
              accessibilityLabel="View monthly report">
              View report
            </Button>
          ) : null}
          {card.dismissKey && onDismiss ? (
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onPress={() => onDismiss(card.dismissKey!)}
              accessibilityLabel="Dismiss monthly report">
              Dismiss
            </Button>
          ) : null}
        </View>
      </Card>
    </Animated.View>
  );
});
