import { Pressable, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Dumbbell, BarChart3, User } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';
import { themeHex } from '@/lib/theme';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import { useSettings } from '@/store/settings-store';
import { Text } from '@/components/common/text';
import { Icon } from '@/components/common/icon';

const ICONS: Record<string, LucideIcon> = {
  index: Home,
  workouts: Dumbbell,
  progress: BarChart3,
  profile: User,
};
const LABELS: Record<string, string> = {
  index: 'Home',
  workouts: 'Workouts',
  progress: 'Progress',
  profile: 'Profile',
};

/** Derived from Expo Router so a tab-bar prop change fails here, not at the call site. */
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/**
 * Custom premium tab bar. The active-session pill is rendered separately by
 * the tabs layout as a floating overlay, so it is not part of the tab bar's
 * background.
 */
export function AppTabBar({ state, descriptors, emitter, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const scheme = useAppColorScheme();
  const accent = useSettings((s) => s.accentTheme);
  const colors = themeHex(scheme, accent);

  const activeColor = colors.primary;
  const inactiveColor = colors.mutedForeground;

  return (
    <View className="border-t border-border bg-surface2">
      <View className="flex-row" style={{ paddingBottom: insets.bottom, paddingTop: 8, height: 64 + insets.bottom }}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const TabIcon = ICONS[route.name] ?? Home;
          const label = LABELS[route.name] ?? route.name;
          const { options } = descriptors[route.key];
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              className="flex-1 items-center py-2">
              <Icon icon={TabIcon} size={26} color={focused ? activeColor : inactiveColor} />
              <Text className={cn('mt-1.5 text-xs', focused ? 'font-semibold' : '')} style={{ color: focused ? activeColor : inactiveColor }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
