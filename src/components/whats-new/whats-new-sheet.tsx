import { useRouter, type Href } from 'expo-router';
import { Activity, HeartPulse, LayoutGrid, LogIn, Mic, Share2, ShieldCheck, Sparkles, TrendingUp, type LucideIcon } from 'lucide-react-native';
import { useRef, useState, useSyncExternalStore, type ComponentRef } from 'react';
import { View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { AiHero } from '@/components/ai/ai-hero';
import { Icon as Glyph } from '@/components/common/icon';
import { Body, Caption, Title } from '@/components/common/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Tappable } from '@/components/ui/tappable';
import { unseenWhatsNew, type WhatsNewIcon, type WhatsNewItem } from '@/contracts/releases/whats-new';
import { useActiveWorkout } from '@/store/active-workout-store';
import { useSettings } from '@/store/settings-store';
import { motionDuration } from '@/styles/motion';

const ICONS: Record<WhatsNewIcon, LucideIcon> = {
  trending: TrendingUp,
  heart: HeartPulse,
  mic: Mic,
  share: Share2,
  widget: LayoutGrid,
  sparkles: Sparkles,
  sign_in: LogIn,
  shield: ShieldCheck,
};

const subscribeHydration = (cb: () => void) => useSettings.persist.onFinishHydration(cb);
const isHydrated = () => useSettings.persist.hasHydrated();

/**
 * What's new (ASK-UI.md "What's new sheet", RELEASES.md). Every update the
 * user hasn't seen, as one sheet: the brand art once, then a swipeable row
 * of cards (icon, New, title, one sentence, up to 3 lines) with page dots.
 * All pages share the tallest page's height, so swiping never resizes the
 * sheet. One primary action that follows the current card, one "Later".
 * Closing either way marks every card shown as seen; at most once per
 * open, never during a workout. Items come from src/contracts/releases,
 * the same pack the web and the release feed read.
 */
export function WhatsNewSheet() {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribeHydration, isHydrated);
  const inWorkout = useActiveWorkout((s) => s.activeLogId != null);
  const { seenIds, dismiss } = useSettings(
    useShallow((s) => ({ seenIds: s.dismissedAnnouncementIds, dismiss: s.dismissAnnouncement })),
  );
  // Freeze the list for this open: marking seen must not reshuffle pages mid-swipe.
  const [items, setItems] = useState<WhatsNewItem[] | null>(null);
  if (hydrated && items === null) setItems(unseenWhatsNew(seenIds));
  const [closed, setClosed] = useState(false);
  const [page, setPage] = useState(0);
  const [width, setWidth] = useState(0);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);

  const list = items ?? [];
  const open = hydrated && !closed && !inWorkout && list.length > 0;
  const current = list[Math.min(page, list.length - 1)];
  const last = page >= list.length - 1;

  const close = () => {
    setClosed(true);
    for (const i of list) dismiss(i.id);
  };
  const goTo = (i: number) => {
    setPage(i);
    scroller.current?.scrollTo({ x: i * width, animated: true });
  };
  const primary = () => {
    if (current?.href) {
      close();
      router.push(current.href as Href);
    } else if (!last) goTo(page + 1);
    else close();
  };
  // Measure the scroller itself, unrounded: pages must equal its viewport.
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const primaryLabel = current?.href ? (current.cta ?? 'Try it') : last ? 'Done' : 'Next';

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()} mode="fit">
      <View className="gap-4 pb-4">
        <AiHero
          compact
          title="What's new"
          subtitle={list.length > 1 ? `${list.length} updates · swipe through` : 'In this update'}
        />
        <ScrollView
          ref={scroller}
          horizontal
          // Explicit interval, not pagingEnabled: Android's pager overshot by a
          // few px per page inside the native sheet, so the next card peeked in.
          snapToInterval={width || undefined}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          onLayout={onLayout}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onSettle}
          accessibilityRole="adjustable"
          accessibilityLabel={`Update ${page + 1} of ${list.length}`}>
          {width > 0 ? list.map((item) => <WhatsNewCard key={item.id} item={item} width={width} />) : null}
        </ScrollView>
        {list.length > 1 ? <Dots count={list.length} page={page} onPick={goTo} /> : null}
        <View className="gap-2">
          <Button onPress={primary}>{primaryLabel}</Button>
          <Button variant="ghost" onPress={close}>
            Later
          </Button>
        </View>
      </View>
    </Sheet>
  );
}

function WhatsNewCard({ item, width }: { item: WhatsNewItem; width: number }) {
  const Icon = ICONS[item.icon] ?? Activity;
  return (
    <View style={{ width }} className="gap-3 pr-1" accessible accessibilityLabel={`${item.title}. ${item.body}`}>
      <View className="flex-row items-center gap-3">
        <View className="size-10 items-center justify-center rounded-xl bg-primary/10">
          <Glyph icon={Icon} size={20} color="primary" />
        </View>
        <Badge>New</Badge>
      </View>
      <Title>{item.title}</Title>
      <Body className="text-foreground">{item.body}</Body>
      {item.bullets?.length ? (
        <View className="gap-1.5">
          {item.bullets.slice(0, 3).map((b) => (
            <View key={b} className="flex-row gap-2">
              <Caption>•</Caption>
              <Caption className="flex-1">{b}</Caption>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Dots({ count, page, onPick }: { count: number; page: number; onPick: (i: number) => void }) {
  return (
    <View className="flex-row items-center justify-center gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <Tappable
          key={i}
          onPress={() => onPick(i)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Update ${i + 1} of ${count}`}
          accessibilityState={{ selected: i === page }}>
          <Dot active={i === page} />
        </Tappable>
      ))}
    </View>
  );
}

function Dot({ active }: { active: boolean }) {
  // Reanimated honours the system reduce-motion setting for withTiming.
  const style = useAnimatedStyle(() => ({
    width: withTiming(active ? 18 : 6, { duration: motionDuration.state }),
    opacity: withTiming(active ? 1 : 0.35, { duration: motionDuration.state }),
  }));
  return <Animated.View style={style} className="h-1.5 rounded-full bg-primary" />;
}
