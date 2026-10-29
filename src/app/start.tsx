import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';

import { getActiveWorkout, startWorkout } from '@/db/queries';
import { useActiveWorkout } from '@/store/active-workout-store';

/**
 * `incline:///start` — the Quick start widget's target. Resumes the running
 * session if there is one (never starts a second), otherwise starts an empty
 * workout and lands in it. Replaces itself so Back returns to Home.
 */
export default function StartRoute() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void (async () => {
      try {
        const active = await getActiveWorkout();
        const id = active?.id ?? (await startWorkout(null, 'Workout'));
        useActiveWorkout.getState().setActive(id);
        router.replace(`/session/${id}`);
      } catch {
        router.replace('/');
      }
    })();
  }, [router]);

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator />
    </View>
  );
}
