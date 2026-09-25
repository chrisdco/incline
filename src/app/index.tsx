import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useAppAuth } from '@/auth/use-app-auth';

import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';
import { DeletionScheduledScreen } from '@/components/auth/deletion-scheduled-screen';
import { bindLocalAccount } from '@/db/account';
import { useDatabaseReady } from '@/hooks/use-database';
import { useProfile } from '@/hooks/use-data';
import { cancelDeletion, getDeletionStatus, type DeletionStatus } from '@/lib/account-deletion';
import { isDevAuthBypassEnabled } from '@/lib/env';
import { ACCOUNT_DELETION_ENABLED } from '@/constants/config';
import { runSync, syncBackendReady } from '@/sync';

/**
 * Root gate: routes based on auth state → deletion check → onboarding → app.
 * Flow: unauthenticated → (auth)/sign-in → (onboarding) → (app)/(tabs)
 */
export default function Gate() {
  const ready = useDatabaseReady();
  const { isSignedIn, isLoaded: authLoaded, userId, getToken, signOut } = useAppAuth();
  const { data: profile, loading: profileLoading, refetch: refetchProfile } = useProfile();
  const router = useRouter();
  const segments = useSegments();
  const [bound, setBound] = useState(false);
  const [deletion, setDeletion] = useState<DeletionStatus | null | undefined>(undefined);
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  // Bind Clerk identity to local SQLite owner before routing into the app.
  // Different Clerk user → wipe local workouts/profile so accounts never share history.
  useEffect(() => {
    if (!ready || !authLoaded || !isSignedIn || !userId) {
      setBound(!isSignedIn);
      if (!isSignedIn) setDeletion(undefined);
      return;
    }
    let active = true;
    setBound(false);
    setDeletion(undefined);
    (async () => {
      try {
        const result = await bindLocalAccount(userId);
        if (result.switched) {
          try {
            const { clearCoachNarrationCache } = await import('@/coaching/narrate-client');
            await clearCoachNarrationCache();
          } catch {
            // narration cache is best-effort; bind must not fail on it
          }
        }
        // Grace-period check before any sync (skipped while the feature ships
        // dark). Unknown (offline, misconfigured backend) allows local app use
        // but skips this boot's sync — never mistaken for "clear".
        const check = ACCOUNT_DELETION_ENABLED
          ? await getDeletionStatus(userId, (opts) => getTokenRef.current(opts))
          : { ok: true, scheduled: null } as const;
        if (!active) return;
        setDeletion(check.ok ? check.scheduled : null);
        if (check.ok && check.scheduled) {
          setBound(true);
          return;
        }
        const skipSync = !check.ok;
        // Pull cloud profile/workouts before routing so a returning account
        // does not land in empty onboarding after a local wipe.
        // Skipped under the dev auth bypass (no token by design — stays local).
        if (!skipSync && syncBackendReady() && !isDevAuthBypassEnabled()) {
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
    if (!ready || !authLoaded || !bound || deletion === undefined || (isSignedIn && profileLoading)) return;

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    const inApp = segments[0] === '(app)';

    // Not signed in → auth screen
    if (!isSignedIn) {
      if (!inAuth) router.replace('/(auth)/sign-in');
      return;
    }

    // Deletion scheduled → the screen renders instead of any route.
    if (deletion) return;

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
  }, [ready, authLoaded, bound, deletion, isSignedIn, profileLoading, profile, segments, router]);

  if (deletion && userId) {
    return (
      <DeletionScheduledScreen
        purgeAt={deletion.purge_at}
        onUndo={async () => {
          await cancelDeletion(userId, (opts) => getTokenRef.current(opts));
          setDeletion(null);
          await refetchProfile();
          if (syncBackendReady() && !isDevAuthBypassEnabled()) {
            await runSync({ userId, getToken: (opts) => getTokenRef.current(opts) });
          }
        }}
        onSignOut={() => {
          setDeletion(undefined);
          void signOut().finally(() => {
            router.replace('/(auth)/sign-in');
          });
        }}
      />
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <PrimaryActivityIndicator />
    </View>
  );
}
