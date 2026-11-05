import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ArrowRight,
  CalendarRange,
  Flame,
  Megaphone,
  Sparkles,
  Target,
  ArrowUpRight,
  Trophy,
} from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { Card } from '@/components/ui/card';
import type { HomeContextCard as HomeContextCardModel, HomeContextIcon } from '@/lib/home-context';

const ICONS: Record<HomeContextIcon, typeof Sparkles> = {
  calendar: CalendarRange,
  sparkles: Sparkles,
  flame: Flame,
  target: Target,
  trophy: Trophy,
  megaphone: Megaphone,
  trend: ArrowUpRight,
};

export const HomeContextCard = memo(function HomeContextCard({
  card,
  onDismiss,
  index = 0,
}: {
  card: HomeContextCardModel;
  onDismiss?: (id: string) => void;
  index?: number;
}) {
  const router = useRouter();
  const IconComponent = ICONS[card.icon];

  const content = (
    <Card elevation="raised">
      <View className="flex-row items-center gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-xl bg-muted">
          <Icon icon={IconComponent} size={18} color="primary" />
        </View>
        <View className="min-w-0 flex-1">
          <Body className="font-semibold text-foreground">{card.title}</Body>
          <Caption className="mt-0.5">{card.subtitle}</Caption>
        </View>
        {card.href ? (
          <Icon icon={ArrowRight} size={18} color="muted-foreground" />
        ) : card.dismissKey && onDismiss ? (
          <Pressable
            onPress={() => onDismiss(card.dismissKey!)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Dismiss">
            <Caption className="text-muted-foreground">Dismiss</Caption>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );

  const wrapped = card.href ? (
    <Pressable
      onPress={() => router.push(card.href as Href)}
      accessibilityRole="button"
      accessibilityLabel={card.title}>
      {content}
    </Pressable>
  ) : (
    content
  );

  return (
    <Animated.View
      key={card.id}
      entering={FadeInDown.duration(220).delay(index * 40)}>
      {wrapped}
    </Animated.View>
  );
});
