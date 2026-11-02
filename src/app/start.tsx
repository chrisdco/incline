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
async function resumeOrStart(): Promise<number> {
  const active = await getActiveWorkout();
  return active?.id ?? startWorkout(null, 'Workout');
}

export default function StartRoute() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    resumeOrStart().then(
      (id) => {
        useActiveWorkout.getState().setActive(id);
        router.replace(`/session/${id}`);
      },
      () => router.replace('/'),
    );
  }, [router]);

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator />
    </View>
  );
}
