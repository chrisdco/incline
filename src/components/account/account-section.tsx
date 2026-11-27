import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { UserX } from 'lucide-react-native';

import { useAppAuth } from '@/auth/use-app-auth';
import { resetAiSettings } from '@/ai/byok';
import { SignOutRow } from '@/components/account/sign-out-row';
import { Icon } from '@/components/common/icon';
import { ListGroup, ListRow, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { ACCOUNT_DELETION_ENABLED } from '@/constants/config';
import { resetUserData } from '@/db/queries';
import { requestDeletion } from '@/lib/account-deletion';
import { isDevAuthBypassEnabled } from '@/lib/env';
import { useActiveWorkout } from '@/store/active-workout-store';

/**
 * Settings → Account: delete account and sign out. Lives in Settings, where
 * people (and Play's account-deletion policy) look for it; Profile holds
 * only the user's own training things.
 */
export function AccountSection({ show }: { show: (id: string) => boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const { signOut, userId, getToken } = useAppAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Hidden under the dev auth bypass: stub sign-out is a noop and the gate
  // would bounce straight back into the app.
  if (isDevAuthBypassEnabled()) return null;
  const showDelete = ACCOUNT_DELETION_ENABLED && show('delete-account');
  const showSignOut = show('sign-out');
  if (!showDelete && !showSignOut) return null;

  const deleteAccount = async () => {
    if (!userId || deleting) return;
    setDeleting(true);
    // Schedule server-side first: if this throws, nothing local is touched.
    try {
      await requestDeletion(userId, getToken);
    } catch {
      toast({ title: 'Could not schedule deletion', variant: 'destructive' });
      setDeleting(false);
      return;
    }
    // Wipe-then-exit runs even if the wipe itself throws: the server already
    // scheduled, so staying signed in with partial data is the worse outcome.
    // Next login lands on the scheduled screen either way.
    try {
      await resetUserData();
    } catch (err) {
      console.warn('[account] local wipe incomplete after scheduled deletion', err);
    }
    useActiveWorkout.getState().clear();
    await resetAiSettings().catch(() => undefined);
    setDeleteOpen(false);
    setDeleting(false);
    try {
      await signOut();
    } catch {
      // Clerk sign-out is best-effort here; the gate re-routes regardless.
    }
    router.replace('/(auth)/sign-in' as Href);
  };

  return (
    <>
      <Section title="Account">
        <ListGroup>
          {showDelete ? (
            <ListRow
              icon={<Icon icon={UserX} size={18} color="destructive" />}
              title="Delete account"
              subtitle="30-day undo window"
              tone="destructive"
              onPress={() => setDeleteOpen(true)}
            />
          ) : null}
          {showSignOut ? <SignOutRow /> : null}
        </ListGroup>
      </Section>
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}
        title="Delete your account?"
        description="This schedules deletion of all workouts, measurements, routines and photos in 30 days. This device is wiped now; signing back in before the purge cancels it and restores everything. Export first — purged data cannot be recovered."
        footer={
          <>
            <Button variant="outline" onPress={() => setDeleteOpen(false)} disabled={deleting}>Keep</Button>
            <Button variant="destructive" onPress={() => { void deleteAccount(); }} disabled={deleting} loading={deleting}>Delete</Button>
          </>
        }
      />
    </>
  );
}
