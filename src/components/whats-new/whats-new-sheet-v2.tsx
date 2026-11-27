import { useRouter, type Href } from 'expo-router';
import { useRef, useState, useSyncExternalStore, type ComponentRef } from 'react';
import { View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { Body, Caption, Title } from '@/components/common/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Tappable } from '@/components/ui/tappable';
import { levelOf, unseenWhatsNew, type WhatsNewItem } from '@/contracts/releases/whats-new';
import { useActiveWorkout } from '@/store/active-workout-store';
import { useSettings } from '@/store/settings-store';
import { motionDuration } from '@/styles/motion';

import { WhatsNewArt } from './whats-new-art';

const subscribeHydration = (cb: () => void) => useSettings.persist.onFinishHydration(cb);
const isHydrated = () => useSettings.persist.hasHydrated();

/**
 * What's new v2 (#410, WORK-QUEUE Build 3 1c). Same flow as the classic
 * sheet (frozen list per open, one primary action, Later; closing marks
 * every card seen; never during a workout) with per-card art at a fixed
 * aspect so swiping never resizes the sheet, must-read cards first and
 * labelled Important, and notes kept out (they live in the changelog).
 */
export function WhatsNewSheetV2() {
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
        <View className="gap-0.5">
          <Title>What&apos;s new</Title>
          <Caption>{list.length > 1 ? `${list.length} updates · swipe through` : 'In this update'}</Caption>
        </View>
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
  const mustRead = levelOf(item) === 'must-read';
  return (
    <View style={{ width }} className="gap-3 pr-1" accessible accessibilityLabel={`${mustRead ? 'Important. ' : ''}${item.title}. ${item.body}`}>
      <WhatsNewArt item={item} />
      <View className="flex-row items-center gap-2">
        <Badge variant={mustRead ? 'warning' : 'default'}>{mustRead ? 'Important' : 'New'}</Badge>
        {item.native ? <Caption>Needs the latest app build</Caption> : null}
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
