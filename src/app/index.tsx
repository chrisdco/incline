import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useAppAuth } from '@/auth/use-app-auth';

import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';
import { DeletionScheduledScreen } from '@/components/auth/deletion-scheduled-screen';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { bindLocalAccount, completeAccountSwitch, prepareAccountSwitch } from '@/db/account';
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
  // A different account signed in while the previous owner's uploads never
  // finished. Routing holds here until the user picks: lose them or stay.
  const [switchGuard, setSwitchGuard] = useState<{ pending: number } | null>(null);
  const [switching, setSwitching] = useState(false);
  const getTokenRef = useRef(getToken);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  // Bind Clerk identity to local SQLite owner before routing into the app.
  // Different Clerk user → wipe local workouts/profile so accounts never share history.
  // Tail after the owner is settled (fresh claim or completed switch): narration
  // clear, grace-period check, cloud pull, then route. Shared by the automatic
  // flow and the switch-guard dialog resume.
  const finishBindFlow = useCallback(async (uid: string, switched: boolean) => {
    if (switched) {
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
      ? await getDeletionStatus(uid, (opts) => getTokenRef.current(opts))
      : { ok: true, scheduled: null } as const;
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
        userId: uid,
        getToken: (opts) => getTokenRef.current(opts),
      });
    } else if (switched) {
      console.info('[gate] account switched; sync backend not configured — local wipe only');
    }
    await refetchProfile();
    setBound(true);
  }, [refetchProfile]);

  useEffect(() => {
    if (!ready || !authLoaded || !isSignedIn || !userId) {
      setBound(!isSignedIn);
      if (!isSignedIn) setDeletion(undefined);
      return;
    }
    let active = true;
    setBound(false);
    setDeletion(undefined);
    setSwitchGuard(null);
    (async () => {
      try {
        const prepared = await prepareAccountSwitch(userId);
        if (!active) return;
        if (prepared.switched && prepared.pending > 0) {
          // Hold: completing the switch destroys these uploads. The dialog
          // below resumes via confirmSwitch.
          setSwitchGuard({ pending: prepared.pending });
          setBound(true);
          return;
        }
        const result = await bindLocalAccount(userId);
        if (!active) return;
        await finishBindFlow(userId, result.switched);
      } catch (err) {
        console.warn('[gate] bindLocalAccount failed', err);
        if (active) setBound(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [ready, authLoaded, isSignedIn, userId, refetchProfile, finishBindFlow]);

  const confirmSwitch = async () => {
    if (!userId || switching) return;
    setSwitching(true);
    try {
      await completeAccountSwitch(userId);
      setSwitchGuard(null);
      await finishBindFlow(userId, true);
    } catch (err) {
      console.warn('[gate] account switch failed', err);
      setSwitching(false);
    }
  };

  const stayOnAuth = async () => {
    // Local data was never wiped (phase 2 didn't run): signing out the new
    // identity leaves the previous owner's data intact for their next login.
    setSwitchGuard(null);
    try {
      await signOut();
    } finally {
      router.replace('/(auth)/sign-in');
    }
  };

  useEffect(() => {
    if (!ready || !authLoaded || !bound || deletion === undefined || (isSignedIn && profileLoading)) return;
    // Account-switch guard open: hold routing until the user picks.
    if (switchGuard) return;

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
  }, [ready, authLoaded, bound, deletion, isSignedIn, profileLoading, profile, segments, router, switchGuard]);

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
      <Dialog
        open={switchGuard != null}
        onOpenChange={(open) => { if (!open && !switching) void stayOnAuth(); }}
        title="Switch accounts?"
        description={
          switchGuard
            ? `${switchGuard.pending} change${switchGuard.pending === 1 ? '' : 's'} from the previous account never uploaded. Switching now loses ${switchGuard.pending === 1 ? 'it' : 'them'} permanently — sign back in as that account on a connection to save ${switchGuard.pending === 1 ? 'it' : 'them'} first.`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onPress={() => { void stayOnAuth(); }} disabled={switching}>
              Stay
            </Button>
            <Button variant="destructive" onPress={() => { void confirmSwitch(); }} disabled={switching} loading={switching}>
              {switching ? 'Switching…' : 'Lose & switch'}
            </Button>
          </>
        }
      />
    </View>
  );
}
