import { useSyncExternalStore } from 'react';
import { useRouter, type Href } from 'expo-router';
import { View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Body, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { useSettings } from '@/store/settings-store';

import { AiHero } from './ai-hero';

/** Announcement id; reuses the Home announcement dismiss list as the seen flag. */
export const WHATS_NEW_ASK_ID = 'ask-v1';

const subscribeHydration = (cb: () => void) => useSettings.persist.onFinishHydration(cb);
const isHydrated = () => useSettings.persist.hasHydrated();

/**
 * One-time "What's new" sheet announcing Ask, shown on Home. The brand card
 * is the art (AiHero, serif title), then three plain lines on what it does
 * and what it never does. Waits for settings to hydrate so a dismissed
 * announcement never flashes back; dismissing either way marks it seen.
 */
export function WhatsNewAsk() {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribeHydration, isHydrated);
  const { seen, dismiss } = useSettings(
    useShallow((s) => ({ seen: s.dismissedAnnouncementIds.includes(WHATS_NEW_ASK_ID), dismiss: s.dismissAnnouncement })),
  );
  const open = hydrated && !seen;

  const close = () => dismiss(WHATS_NEW_ASK_ID);
  const tryIt = () => {
    close();
    router.push('/(app)/ai' as Href);
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()} title="What's new" mode="fit">
      <View className="gap-4 pb-4">
        <AiHero title="Ask Incline" subtitle="Questions about your training, answered from your log." />
        <View className="gap-2">
          <Body className="text-foreground">Ask how a lift is trending, which muscles you are undertraining, or what to do next.</Body>
          <Body className="text-foreground">Every answer shows what it read. Chats stay on this device.</Body>
          <Caption>Ask reads your workouts; it never changes them.</Caption>
        </View>
        <View className="gap-2">
          <Button onPress={tryIt}>Try Ask</Button>
          <Button variant="ghost" onPress={close}>
            Not now
          </Button>
        </View>
      </View>
    </Sheet>
  );
}
