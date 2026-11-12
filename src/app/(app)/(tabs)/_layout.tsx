import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Tabs, useRouter, type Href } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveIconColor } from '@/lib/icon-color';
import { themeHex } from '@/lib/theme';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import { useSettings } from '@/store/settings-store';
import { isAskContext, useAiEntry } from '@/store/ai-entry-store';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { GlassTabBar, GLASS_BAR_HEIGHT, glassBarInset } from '@/components/layout/glass-tab-bar';
import { tabBarHidden } from '@/hooks/use-tab-bar-scroll';
import { ActiveSessionBar } from '@/components/workout/active-session-bar';
import { DiscardSessionDialog, ResumeSessionDialog } from '@/components/workout/discard-session-dialog';
import { useActiveSession } from '@/hooks/use-active-session';
import { discardWorkout } from '@/db/queries';
import { setCachedSession } from '@/lib/query-keys';
import { useActiveWorkout } from '@/store/active-workout-store';

// Once per JS launch. Component state reset whenever the tabs remount (e.g.
// router.replace home after discarding), and the still-cached session then
// re-triggered this prompt: discard asked twice.
let coldStartPrompted = false;

export default function TabsLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, loading, refetch, nextExercise } = useActiveSession();
  const clear = useActiveWorkout((s) => s.clear);
  const [open, setOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const scheme = useAppColorScheme();
  const accent = useSettings((s) => s.accentTheme);
  const setFrom = useAiEntry((s) => s.setFrom);
  const colors = themeHex(scheme, accent);
  // Selected tab = accent as text on a neutral bar, so the readable text tone.
  const tint = resolveIconColor('primary', scheme === 'dark', accent);
  const android = Platform.OS === 'android';
  // When the glass bar tucks away on scroll, the session bar drops into its
  // slot (iOS docks its accessory the same way).
  const sessionDrop = useAnimatedStyle(() => ({ transform: [{ translateY: tabBarHidden.value * GLASS_BAR_HEIGHT }] }));

  // On cold start with an unfinished session, prompt to resume or discard.
  // Only show for sessions older than 5s (not a fresh start that's still animating).
  useEffect(() => {
    if (loading || coldStartPrompted) return;
    coldStartPrompted = true;
    if (session && Date.now() - session.startedAt > 5000) setOpen(true);
  }, [loading, session]);

  const resume = () => {
    setOpen(false);
    if (session) {
      // Warm the reopen cache so the push lands on content, not a spinner.
      setCachedSession(session);
      router.push(`/session/${session.id}`);
    }
  };
  const discardFromPrompt = async () => {
    setOpen(false);
    if (session) {
      await discardWorkout(session.id);
      clear();
      refetch();
    }
  };
  const handleDiscard = async () => {
    setDiscardOpen(false);
    if (session) {
      await discardWorkout(session.id);
      clear();
      refetch();
    }
  };

  const sessionBar = session ? (
    <ActiveSessionBar
      logId={session.id}
      name={session.name}
      startedAt={session.startedAt}
      nextExercise={nextExercise}
      refetch={refetch}
      onDiscard={() => setDiscardOpen(true)}
    />
  ) : null;

  return (
    <>
      {android ? (
        /*
          Android: the glass tab bar (GlassTabBar) — the iOS 26 shape drawn in
          JS, AI as the round button beside it. `ask` is the iOS-only tab.
        */
        <Tabs
          screenOptions={{ headerShown: false }}
          screenListeners={({ route }) => ({
            focus: () => {
              if (isAskContext(route.name)) setFrom(route.name);
            },
          })}
          tabBar={(props) => <GlassTabBar {...props} onAi={() => router.push('/(app)/ai' as Href)} />}>
          <Tabs.Screen name="index" options={{ title: 'Home' }} />
          <Tabs.Screen name="workouts" options={{ title: 'Workouts' }} />
          <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
          <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
          <Tabs.Screen name="ask" options={{ href: null }} />
        </Tabs>
      ) : (
        /*
          iOS: the real UITabBar (liquid glass). AI is the separate search-role
          tab (its own pill on iOS 26.1+; `prominent` keeps it visible when the
          bar minimizes on iOS 27+). The session bar is the bottom accessory.
        */
        <NativeTabs
          tintColor={tint}
          iconColor={{ default: colors.mutedForeground, selected: tint }}
          minimizeBehavior="onScrollDown"
          screenListeners={({ route }) => ({
            focus: () => {
              if (isAskContext(route.name)) setFrom(route.name);
            },
          })}>
          <NativeTabs.Trigger name="index">
            <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
            <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="workouts">
            <NativeTabs.Trigger.Icon sf="dumbbell" />
            <NativeTabs.Trigger.Label>Workouts</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="progress">
            <NativeTabs.Trigger.Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} />
            <NativeTabs.Trigger.Label>Progress</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="profile">
            <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} />
            <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="ask" role="search" prominent>
            <NativeTabs.Trigger.Icon sf="sparkles" />
            <NativeTabs.Trigger.Label>Ask</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>

          {session ? (
            <NativeTabs.BottomAccessory>
              <SessionAccessory
                logId={session.id}
                name={session.name}
                startedAt={session.startedAt}
                nextExercise={nextExercise}
                refetch={refetch}
                onDiscard={() => setDiscardOpen(true)}
              />
            </NativeTabs.BottomAccessory>
          ) : null}
        </NativeTabs>
      )}

      {android && sessionBar ? (
        // Above the glass bar, where iOS puts the bottom accessory.
        <Animated.View
          pointerEvents="box-none"
          style={[{ position: 'absolute', left: 0, right: 0, bottom: glassBarInset(insets.bottom), zIndex: 50 }, sessionDrop]}>
          {sessionBar}
        </Animated.View>
      ) : null}

      <ResumeSessionDialog
        open={open}
        onOpenChange={setOpen}
        onResume={resume}
        onDiscard={discardFromPrompt}
      />

      <DiscardSessionDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onConfirm={handleDiscard}
      />
    </>
  );
}

function SessionAccessory(props: Omit<Parameters<typeof ActiveSessionBar>[0], 'embedded' | 'compact'>) {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  return <ActiveSessionBar {...props} embedded compact={placement === 'inline'} />;
}
