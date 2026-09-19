import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useAppAuth } from '@/auth/use-app-auth';

import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';
import { bindLocalAccount } from '@/db/account';
import { useDatabaseReady } from '@/hooks/use-database';
import { useProfile } from '@/hooks/use-data';
import { isDevAuthBypassEnabled } from '@/lib/env';
import { runSync, syncBackendReady } from '@/sync';

/**
 * Root gate: routes based on auth state → onboarding → app.
 * Flow: unauthenticated → (auth)/sign-in → (onboarding) → (app)/(tabs)
 */
export default function Gate() {
  const ready = useDatabaseReady();
  const { isSignedIn, isLoaded: authLoaded, userId, getToken } = useAppAuth();
  const { data: profile, loading: profileLoading, refetch: refetchProfile } = useProfile();
  const router = useRouter();
  const segments = useSegments();
  const [bound, setBound] = useState(false);
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  // Bind Clerk identity to local SQLite owner before routing into the app.
  // Different Clerk user → wipe local workouts/profile so accounts never share history.
  useEffect(() => {
    if (!ready || !authLoaded || !isSignedIn || !userId) {
      setBound(!isSignedIn);
      return;
    }
    let active = true;
    setBound(false);
    (async () => {
      try {
        const result = await bindLocalAccount(userId);
        // Pull cloud profile/workouts before routing so a returning account
        // does not land in empty onboarding after a local wipe.
        // Skipped under the dev auth bypass (no token by design — stays local).
        if (syncBackendReady() && !isDevAuthBypassEnabled()) {
          await runSync({
            userId,
            getToken: (opts) => getTokenRef.current(opts),
          });
        } else if (result.switched) {
          console.info('[gate] account switched; sync backend not configured — local wipe only');
        }
        if (!active) return;
        await refetchProfile();
        if (active) setBound(true);
      } catch (err) {
        console.warn('[gate] bindLocalAccount failed', err);
        if (active) setBound(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [ready, authLoaded, isSignedIn, userId, refetchProfile]);

  useEffect(() => {
    if (!ready || !authLoaded || !bound || (isSignedIn && profileLoading)) return;

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    const inApp = segments[0] === '(app)';

    // Not signed in → auth screen
    if (!isSignedIn) {
      if (!inAuth) router.replace('/(auth)/sign-in');
      return;
    }

    // Signed in but no profile row yet (first login) → onboarding
    if (!profile) {
      if (!inOnboarding) router.replace('/(onboarding)');
      return;
    }

    // Signed in, profile exists, onboarding not completed → onboarding
    // But also skip onboarding if essential fields (name) are already filled
    const needsOnboarding = !profile.onboardingCompleted && !profile.name;
    if (needsOnboarding && !inOnboarding) {
      router.replace('/(onboarding)');
    } else if ((profile.onboardingCompleted || profile.name) && !inApp) {
      router.replace('/(app)/(tabs)');
    }
  }, [ready, authLoaded, bound, isSignedIn, profileLoading, profile, segments, router]);

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <PrimaryActivityIndicator />
    </View>
  );
}
