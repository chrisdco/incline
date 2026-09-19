import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTabBar } from '@/components/common/app-tab-bar';
import { ActiveSessionBar } from '@/components/workout/active-session-bar';
import { DiscardSessionDialog, ResumeSessionDialog } from '@/components/workout/discard-session-dialog';
import { useActiveSession } from '@/hooks/use-active-session';
import { discardWorkout } from '@/db/queries';
import { setCachedSession } from '@/db/session-cache';
import { useActiveWorkout } from '@/store/active-workout-store';

export default function TabsLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, refetch, nextExercise } = useActiveSession();
  const clear = useActiveWorkout((s) => s.clear);
  const [prompted, setPrompted] = useState(false);
  const [open, setOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const tabBarHeight = 64 + insets.bottom;

  // On cold start with an unfinished session, prompt to resume or discard.
  // Only show for sessions older than 5s (not a fresh start that's still animating).
  useEffect(() => {
    if (session && !prompted) {
      const ageMs = Date.now() - session.startedAt;
      if (ageMs > 5000) {
        setOpen(true);
      }
      setPrompted(true);
    }
  }, [session, prompted]);

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
      <Tabs tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="workouts" options={{ title: 'Workouts' }} />
        <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>

      {session ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: tabBarHeight, zIndex: 50 }}>
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
