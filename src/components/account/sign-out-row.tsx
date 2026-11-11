import { useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { LogOut } from 'lucide-react-native';

import { useAppAuth } from '@/auth/use-app-auth';
import { Icon } from '@/components/common/icon';
import { ListRow } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { pendingLocalChanges, signOutLocalAccount } from '@/db/account';
import { useCloudSync } from '@/hooks/use-cloud-sync';

/** Dialog copy for the sign-out confirmation (pure, for tests and reuse). */
export function signOutCopy(pending: number, backupOn: boolean): string {
  if (!backupOn) {
    return 'This phone isn’t backing up, so your workouts, measurements and photos are permanently removed from it. Export first if you want a copy.';
  }
  if (pending > 0) {
    return `${pending} change${pending === 1 ? ' hasn’t' : 's haven’t'} synced yet and will be lost. Everything else is backed up and comes back when you sign in.`;
  }
  return 'Your workouts, measurements and photos are removed from this phone. They’re backed up and come back when you sign in. Haptics and reminders stay.';
}

// Module-level so the component body has no try blocks (React Compiler).
async function countPending(): Promise<number> {
  try {
    return await pendingLocalChanges();
  } catch {
    return 0;
  }
}

async function wipeLocal(): Promise<boolean> {
  try {
    await signOutLocalAccount();
    return true;
  } catch (err) {
    console.warn('[sign-out] local wipe failed', err);
    return false;
  }
}

/**
 * Sign out with a local wipe (#145). Confirms first; when changes haven't
 * synced, offers "Sync now" before "Sign out anyway". The wipe runs before
 * the Clerk sign-out, and a failed wipe aborts it so data is never left
 * behind under a signed-out app. Drop-in for the Profile → Account row.
 */
export function SignOutRow() {
  const router = useRouter();
  const { toast } = useToast();
  const { signOut } = useAppAuth();
  const { enabled: backupOn, syncing, syncNow } = useCloudSync({ auto: false });
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);

  const openConfirm = async () => {
    setPending(await countPending());
    setOpen(true);
  };

  const syncFirst = async () => {
    const result = await syncNow();
    const left = await countPending();
    setPending(left);
    if (!result.ok || left > 0) {
      toast({
        title: 'Some changes didn’t sync',
        description: 'Try again on a better connection, or sign out anyway.',
        variant: 'warning',
      });
    }
  };

  const confirm = async () => {
    setBusy(true);
    const wiped = await wipeLocal();
    if (!wiped) {
      setBusy(false);
      toast({ title: 'Couldn’t clear this phone', description: 'You’re still signed in. Try again.', variant: 'destructive' });
      return;
    }
    setOpen(false);
    setBusy(false);
    await signOut().catch(() => undefined);
    router.replace('/(auth)/sign-in' as Href);
  };

  const unsynced = backupOn && pending > 0;

  return (
    <>
      <ListRow
        icon={<Icon icon={LogOut} size={18} color="muted-foreground" />}
        title="Sign out"
        onPress={() => void openConfirm()}
      />
      <Dialog
        open={open}
        onOpenChange={(next) => { if (!busy) setOpen(next); }}
        title="Sign out and clear this phone?"
        description={signOutCopy(pending, backupOn)}
        footer={
          unsynced ? (
            <>
              <Button variant="outline" onPress={() => void syncFirst()} disabled={busy || syncing} loading={syncing}>
                Sync now
              </Button>
              <Button variant="destructive" onPress={() => void confirm()} disabled={busy || syncing} loading={busy}>
                Sign out anyway
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onPress={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button variant="destructive" onPress={() => void confirm()} disabled={busy} loading={busy}>
                Sign out
              </Button>
            </>
          )
        }
      />
    </>
  );
}
