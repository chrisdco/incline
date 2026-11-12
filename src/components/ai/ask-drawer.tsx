import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInLeft, SlideOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageCircle, ShieldCheck, SlidersHorizontal, SquarePen } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { ListGroup, ListRow, SectionLabel } from '@/components/layout';
import { Tappable } from '@/components/ui/tappable';
import { deleteChatThread } from '@/db/queries/chat';
import { chatThreadsQuery } from '@/lib/query-keys';
import { useAiEntry, type AskContext } from '@/store/ai-entry-store';
import { motionDuration } from '@/styles/motion';

type Tool = { title: string; href: Href };

const PLAN: Tool = {
  title: 'Build a plan',
  href: '/(app)/plan-builder' as Href,
};
const ADJUST: Tool = {
  title: 'Adjust my program',
  href: '/(app)/program-adjust' as Href,
};
const DELOAD: Tool = { title: 'Deload check', href: '/(app)/deload' as Href };
const BALANCE: Tool = {
  title: 'Muscle balance',
  href: '/(app)/muscle-distribution' as Href,
};
const WEEK: Tool = { title: 'Week report', href: '/(app)/report/week' as Href };
const MONTH: Tool = {
  title: 'Month report',
  href: '/(app)/report/month' as Href,
};

/** Tools lead with the screen Ask was opened from. */
const TOOLS: Record<AskContext, Tool[]> = {
  index: [WEEK, PLAN, DELOAD, ADJUST],
  workouts: [ADJUST, PLAN, DELOAD, BALANCE],
  progress: [BALANCE, WEEK, MONTH, PLAN],
  profile: [MONTH, WEEK, PLAN, ADJUST],
};

const EASE = Easing.out(Easing.cubic);

export function ago(ms: number, now = Date.now()): string {
  const days = Math.floor((now - ms) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function confirmDelete(uuid: string, title: string) {
  Alert.alert('Delete chat?', `"${title}" will be removed from this device.`, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: () => void deleteChatThread(uuid),
    },
  ]);
}

/**
 * Ask's history drawer (ASK-UI.md): New chat, Tools, Recents, then privacy
 * and settings. Opens from ☰ only (no edge swipe; that would fight Android's
 * back gesture). Long-press a chat to delete it.
 */
export function AskDrawer({ open, onClose, onNewChat }: { open: boolean; onClose: () => void; onNewChat: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const from = useAiEntry((s) => s.from);
  const { data: threads = [] } = useQuery(chatThreadsQuery);
  const go = (href: Href) => {
    onClose();
    router.push(href);
  };

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {open ? (
        <View className="flex-1 flex-row">
          <Animated.View
            entering={SlideInLeft.duration(motionDuration.enter).easing(EASE)}
            exiting={SlideOutLeft.duration(motionDuration.exit)}
            className="w-4/5 max-w-sm bg-background"
            style={{
              paddingTop: insets.top + 8,
              paddingBottom: insets.bottom + 8,
            }}>
            <View className="px-4 pb-3">
              <Tappable
                onPress={() => {
                  onClose();
                  onNewChat();
                }}
                pressedOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="New chat"
                className="h-12 flex-row items-center gap-3 rounded-2xl bg-surface2 px-4">
                <Icon icon={SquarePen} size={18} color="foreground" />
                <Body className="font-medium">New chat</Body>
              </Tappable>
            </View>
            <ScrollView contentContainerClassName="px-4 pb-6 gap-6">
              <View>
                <SectionLabel>Tools</SectionLabel>
                <ListGroup>
                  {TOOLS[from].map((t) => (
                    <ListRow key={t.title} title={t.title} onPress={() => go(t.href)} />
                  ))}
                </ListGroup>
              </View>

              <View>
                <SectionLabel>Recents</SectionLabel>
                {threads.length ? (
                  <View className="gap-1">
                    {threads.map((t) => (
                      <Tappable
                        key={t.uuid}
                        onPress={() => go(`/(app)/chat/${t.uuid}` as Href)}
                        onLongPress={() => confirmDelete(t.uuid, t.title || 'Chat')}
                        pressedOpacity={0.6}
                        accessibilityRole="button"
                        accessibilityLabel={t.title || 'Chat'}
                        accessibilityHint="Long press to delete"
                        className="flex-row items-center gap-3 rounded-xl px-2 py-2.5">
                        <Icon icon={MessageCircle} size={16} color="muted-foreground" />
                        <Body numberOfLines={1} className="flex-1">
                          {t.title || 'Chat'}
                        </Body>
                        <Caption>{ago(t.updatedAt)}</Caption>
                      </Tappable>
                    ))}
                  </View>
                ) : (
                  <Caption className="px-1">Your chats stay on this device.</Caption>
                )}
              </View>

              <ListGroup>
                <ListRow
                  icon={<Icon icon={ShieldCheck} size={18} color="muted-foreground" />}
                  title="AI data use"
                  onPress={() => go('/(app)/ai-data-use' as Href)}
                />
                <ListRow
                  icon={<Icon icon={SlidersHorizontal} size={18} color="muted-foreground" />}
                  title="AI settings"
                  onPress={() => go('/(app)/ai-settings' as Href)}
                />
              </ListGroup>
            </ScrollView>
          </Animated.View>
          <Animated.View entering={FadeIn.duration(motionDuration.enter)} exiting={FadeOut} className="flex-1 bg-black/40">
            <Pressable className="flex-1" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
          </Animated.View>
        </View>
      ) : null}
    </Modal>
  );
}
