import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Body, Caption, Heading } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

/**
 * Shown instead of the app when a deletion is scheduled (grace period).
 * Undo just clears the flag — cloud rows were never tombstoned, so the next
 * sync restores whatever this device wiped.
 */
export function DeletionScheduledScreen({
  purgeAt,
  onUndo,
  onSignOut,
}: {
  purgeAt: string;
  onUndo: () => Promise<void>;
  onSignOut: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const date = new Date(purgeAt).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center px-8">
        <Heading className="text-center">Account scheduled for deletion</Heading>
        <Body className="mt-2 text-center text-muted-foreground">
          Everything is wiped on {date}. Undo before then to keep your account — sync restores what this device removed.
        </Body>
        <Button
          className="mt-6 w-full"
          loading={busy}
          disabled={busy}
          onPress={() => {
            setBusy(true);
            onUndo()
              .catch(() => {
                toast({ title: 'Could not undo deletion', variant: 'destructive' });
              })
              .finally(() => setBusy(false));
          }}>
          Undo deletion
        </Button>
        <Button variant="ghost" className="mt-2 w-full" onPress={onSignOut}>
          Sign out
        </Button>
        <Caption className="mt-4 text-center">Export first from the web app — purged data cannot be recovered.</Caption>
      </View>
    </SafeAreaView>
  );
}
