import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkles } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Tappable } from '@/components/ui/tappable';
import { resolveIconColor } from '@/lib/icon-color';
import { themeHex } from '@/lib/theme';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import { useSettings } from '@/store/settings-store';
import { isAskContext, useAiEntry } from '@/store/ai-entry-store';
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

/** Material 3 navigation bar height (measured on device: 80dp + gesture inset). */
const NAV_HEIGHT = 80;
/** ActiveSessionBar: 56 circle + 24 padding + 8 margin + border. */
const SESSION_BAR_HEIGHT = 90;

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

  return (
    <>
      {/*
        Native tab bar (iOS UITabBar / liquid glass, Android Material nav).
        AI entry follows each platform: iOS gets the separate search-role tab
        (its own pill on iOS 26.1+; add `prominent` for iOS 27 once expo-router >= 58.0.30); Android gets a
        floating button that opens `/ai` as a sheet (its own route: `/ask` is the tab).
      */}
      <NativeTabs
        tintColor={tint}
        iconColor={{ default: colors.mutedForeground, selected: tint }}
        indicatorColor={android ? `${colors.primary}33` : undefined}
        backgroundColor={android ? colors.surface1 : undefined}
        minimizeBehavior="onScrollDown"
        screenListeners={({ route }) => ({
          focus: () => {
            if (isAskContext(route.name)) setFrom(route.name);
          },
        })}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="home" />} />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="workouts">
          <NativeTabs.Trigger.Icon sf="dumbbell" src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="fitness-center" />} />
          <NativeTabs.Trigger.Label>Workouts</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="progress">
          <NativeTabs.Trigger.Icon sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }} src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="bar-chart" />} />
          <NativeTabs.Trigger.Label>Progress</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="person" />} />
          <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="ask" role="search" hidden={android}>
          <NativeTabs.Trigger.Icon sf="sparkles" src={<NativeTabs.Trigger.VectorIcon family={MaterialIcons} name="auto-awesome" />} />
          <NativeTabs.Trigger.Label>Ask</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        {/* iOS only in expo-router 58.0.25; Android draws the floating bar below. */}
        {session && !android ? (
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

      {android && session ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: NAV_HEIGHT + insets.bottom, zIndex: 50 }}>
          <ActiveSessionBar
            logId={session.id}
            name={session.name}
            startedAt={session.startedAt}
            nextExercise={nextExercise}
            refetch={refetch}
            onDiscard={() => setDiscardOpen(true)}
          />
        </View>
      ) : null}

      {android ? (
        <View
          pointerEvents="box-none"
          // Clear the nav bar (and the session bar above it) with a 16dp gap.
          style={{ position: 'absolute', right: 16, bottom: NAV_HEIGHT + insets.bottom + (session ? SESSION_BAR_HEIGHT : 0) + 16 }}>
          <Tappable
            onPress={() => router.push('/(app)/ai' as Href)}
            accessibilityRole="button"
            accessibilityLabel="Ask Incline"
            pressedOpacity={0.8}
            className="h-14 w-14 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <Icon icon={Sparkles} size={24} color="primary-foreground" />
          </Tappable>
        </View>
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
