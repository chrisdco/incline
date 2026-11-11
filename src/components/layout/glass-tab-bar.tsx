import { useEffect, useState, type ComponentProps } from 'react';
import { View } from 'react-native';
import type { Tabs } from 'expo-router';
import { BarChart3, Dumbbell, Home, User, type LucideIcon } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiMark } from '@/components/ai/ai-mark';
import { Icon } from '@/components/common/icon';
import { Text } from '@/components/common/text';
import { Tappable } from '@/components/ui/tappable';
import { useHaptics } from '@/hooks/use-haptics';
import { cn } from '@/lib/cn';

/**
 * Android tab bar in the iOS 26 shape (iOS itself keeps the real UITabBar):
 * a floating capsule over the content, a soft highlight that slides to the
 * selected tab, and the AI entry as its own round button beside it, where
 * iOS puts the search-role tab.
 *
 * "Glass" is a translucent surface with a hairline edge, not a live blur:
 * blurring a scrolling list every frame costs more than it looks worth on
 * mid-range Android.
 */

export const GLASS_BAR_HEIGHT = 64;
/** Gap between the capsule and the gesture/nav inset. */
export const GLASS_BAR_GAP = 8;

/** Derived from Expo Router so a tab-bar prop change fails here, not at the call site. */
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Home', icon: Home },
  workouts: { label: 'Workouts', icon: Dumbbell },
  progress: { label: 'Progress', icon: BarChart3 },
  profile: { label: 'Profile', icon: User },
};
/** Capsule inner padding; the highlight sits inside it. */
const PAD = 6;
const SPRING = { damping: 22, stiffness: 260, mass: 0.8 } as const;

/** Space a tab screen leaves at the bottom so its last row clears the bar. */
export function glassBarInset(bottomInset: number): number {
  return GLASS_BAR_HEIGHT + GLASS_BAR_GAP + bottomInset;
}

export function GlassTabBar({ state, descriptors, emitter, navigateToTab, onAi }: BottomTabBarProps & { onAi: () => void }) {
  const insets = useSafeAreaInsets();
  const { selection } = useHaptics();
  const routes = state.routes.filter((r) => r.name in TABS);
  const focusedKey = state.routes[state.index]?.key;
  const index = Math.max(0, routes.findIndex((r) => r.key === focusedKey));

  const [width, setWidth] = useState(0);
  const slot = width > 0 ? (width - PAD * 2) / routes.length : 0;
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withSpring(index * slot, SPRING);
  }, [index, slot, x]);
  const highlight = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + GLASS_BAR_GAP }}
      className="flex-row items-center gap-2 px-4">
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: GLASS_BAR_HEIGHT, borderRadius: GLASS_BAR_HEIGHT / 2, padding: PAD }}
        className="flex-1 flex-row border border-divider bg-surface2/95 shadow-lg">
        {slot > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              { position: 'absolute', top: PAD, left: PAD, width: slot, bottom: PAD, borderRadius: (GLASS_BAR_HEIGHT - PAD * 2) / 2 },
              highlight,
            ]}
            className="bg-foreground/10"
          />
        ) : null}
        {routes.map((route) => {
          const tab = TABS[route.name];
          const focused = route.key === focusedKey;
          const { options } = descriptors[route.key];
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (focused || event.defaultPrevented) return;
            selection();
            navigateToTab(route.key);
          };
          return (
            <Tappable
              key={route.key}
              onPress={onPress}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              pressedOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? tab.label}
              className="flex-1 items-center justify-center gap-0.5">
              <Icon icon={tab.icon} size={22} color={focused ? 'primary' : 'muted-foreground'} strokeWidth={focused ? 2.4 : 2} />
              <Text className={cn('text-2xs', focused ? 'font-semibold text-primary-text' : 'text-muted-foreground')}>{tab.label}</Text>
            </Tappable>
          );
        })}
      </View>

      <Tappable
        onPress={() => {
          selection();
          onAi();
        }}
        pressedOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Ask Incline"
        style={{ width: GLASS_BAR_HEIGHT, height: GLASS_BAR_HEIGHT, borderRadius: GLASS_BAR_HEIGHT / 2 }}
        className="items-center justify-center border border-divider bg-surface2/95 shadow-lg">
        <Icon icon={AiMark} size={26} color="primary" />
      </Tappable>
    </View>
  );
}
