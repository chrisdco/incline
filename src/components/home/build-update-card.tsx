import { useQuery } from '@tanstack/react-query';
import * as Updates from 'expo-updates';
import { Download, X } from 'lucide-react-native';
import { Linking, Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { RowIcon } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { buildUpdateFor, SIDELOAD_CHANNELS, type ReleaseRow } from '@/contracts/releases/update-check';
import { SUPABASE_URL } from '@/lib/env';
import { useSettings } from '@/store/settings-store';

const feedUrl = (channel: string) => `${SUPABASE_URL}/functions/v1/app-release?format=json&profile=${encodeURIComponent(channel)}`;
const installUrl = (channel: string) => `${SUPABASE_URL}/functions/v1/app-release?profile=${encodeURIComponent(channel)}`;

/**
 * "Update available" (RELEASES.md): a new APK whose native code this install
 * can't get by OTA. One feed read per app open (never on focus or a timer),
 * only on sideloaded channels; Play users update through Play. Tap opens the
 * always-latest install link; ✕ hides it until the next build.
 */
export function BuildUpdateCard() {
  const channel = Updates.channel ?? null;
  const runtimeVersion = Updates.runtimeVersion ?? null;
  const enabled = !!SUPABASE_URL && !!channel && SIDELOAD_CHANNELS.has(channel) && Updates.isEnabled;
  const { data: update } = useQuery({
    queryKey: ['buildUpdate', channel, runtimeVersion],
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    networkMode: 'online',
    queryFn: async () => {
      const res = await fetch(feedUrl(channel!));
      if (!res.ok) return null;
      const body = (await res.json()) as { recent?: ReleaseRow[] };
      return buildUpdateFor(body.recent ?? [], { channel, runtimeVersion });
    },
  });
  const { seen, dismiss } = useSettings(
    useShallow((s) => ({ seen: s.dismissedAnnouncementIds, dismiss: s.dismissAnnouncement })),
  );
  if (!update || !channel) return null;
  const key = `build:${update.id}`;
  if (seen.includes(key)) return null;

  const first = update.notes?.[0]?.title;
  const more = (update.notes?.length ?? 0) - 1;
  const subtitle = first ? (more > 0 ? `${first} and ${more} more` : first) : 'New features need the new app';

  return (
    <Animated.View entering={FadeInDown.duration(220)}>
      <Card className="flex-row items-center gap-3 py-3">
        <Pressable
          onPress={() => void Linking.openURL(installUrl(channel))}
          accessibilityRole="link"
          accessibilityLabel="Update available. Download the new version"
          className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-70">
          <RowIcon>
            <Icon icon={Download} size={18} color="primary" />
          </RowIcon>
          <View className="min-w-0 flex-1">
            <Body className="font-medium text-foreground" numberOfLines={1}>
              Update available · tap to install
            </Body>
            <Caption className="mt-0.5" numberOfLines={1}>{subtitle}</Caption>
          </View>
        </Pressable>
        <Pressable
          onPress={() => dismiss(key)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Hide until the next update"
          className="h-11 w-8 items-center justify-center active:opacity-70">
          <Icon icon={X} size={16} color="muted-foreground" />
        </Pressable>
      </Card>
    </Animated.View>
  );
}
