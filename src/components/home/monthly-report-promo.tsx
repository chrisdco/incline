import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CalendarRange } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
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
        <View className="flex-row items-start gap-3">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
            <Icon icon={CalendarRange} size={22} color="primary" />
          </View>
          <View className="min-w-0 flex-1">
            <Body className="font-semibold text-foreground">{card.title}</Body>
            <Caption className="mt-1">{card.subtitle}</Caption>
          </View>
        </View>
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
