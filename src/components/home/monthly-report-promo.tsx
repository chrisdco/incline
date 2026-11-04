import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CalendarRange, ChevronRight, X } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { RowIcon } from '@/components/layout';
import { Card } from '@/components/ui/card';
import type { HomeContextCard } from '@/lib/home-context';

/**
 * Last month's recap as one compact row: tap opens the report, ✕ dismisses.
 * Not a hero — Home leads with today's workout, so this stays neutral and
 * small (SYSTEM.md §3.1, one filled action per screen).
 */
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
  const open = card.href ? () => router.push(card.href as Href) : undefined;

  return (
    <Animated.View entering={FadeInDown.duration(220).delay(index * 40)}>
      <Card className="flex-row items-center gap-3 py-3">
        <Pressable
          onPress={open}
          disabled={!open}
          accessibilityRole="button"
          accessibilityLabel="View monthly report"
          className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-70">
          <RowIcon>
            <Icon icon={CalendarRange} size={18} color="foreground" />
          </RowIcon>
          <View className="min-w-0 flex-1">
            <Body className="font-medium text-foreground" numberOfLines={1}>{card.title}</Body>
            <Caption className="mt-0.5" numberOfLines={1}>{card.subtitle}</Caption>
          </View>
          {open ? <Icon icon={ChevronRight} size={18} color="muted-foreground" /> : null}
        </Pressable>
        {card.dismissKey && onDismiss ? (
          <Pressable
            onPress={() => onDismiss(card.dismissKey!)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Dismiss monthly report"
            className="h-11 w-8 items-center justify-center active:opacity-70">
            <Icon icon={X} size={16} color="muted-foreground" />
          </Pressable>
        ) : null}
      </Card>
    </Animated.View>
  );
});
