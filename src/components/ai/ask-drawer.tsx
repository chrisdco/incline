import { useState } from 'react';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { Alert, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInLeft, SlideOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarChart3, CalendarRange, Gauge, Plus, Scale, Search, SlidersHorizontal, type LucideIcon } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';

import { Icon } from '@/components/common/icon';
import { Body, Caption, Text } from '@/components/common/text';
import { Tappable } from '@/components/ui/tappable';
import { deleteChatThread } from '@/db/queries/chat';
import { chatThreadsQuery } from '@/lib/query-keys';
import { useAiEntry, type AskContext } from '@/store/ai-entry-store';
import { motionDuration } from '@/styles/motion';
import { PLACEHOLDER_HEX } from '@/styles/tokens';
import { useThemeHex } from '@/lib/theme';

type Tool = { title: string; href: Href; icon: LucideIcon };

const PLAN: Tool = { title: 'Build a plan', href: '/(app)/plan-builder' as Href, icon: CalendarRange };
const ADJUST: Tool = { title: 'Adjust my program', href: '/(app)/program-adjust' as Href, icon: SlidersHorizontal };
const DELOAD: Tool = { title: 'Deload check', href: '/(app)/deload' as Href, icon: Gauge };
const BALANCE: Tool = { title: 'Muscle balance', href: '/(app)/muscle-distribution' as Href, icon: Scale };
const REPORTS: Tool = { title: 'Week and month reports', href: '/(app)/report/week' as Href, icon: BarChart3 };

/** Tools lead with the screen Ask was opened from. */
const TOOLS: Record<AskContext, Tool[]> = {
  index: [PLAN, ADJUST, DELOAD, REPORTS],
  workouts: [ADJUST, PLAN, DELOAD, BALANCE],
  progress: [BALANCE, REPORTS, PLAN, DELOAD],
  profile: [REPORTS, PLAN, ADJUST, DELOAD],
};

/** Recents shown before "View all". */
const RECENT = 6;
const EASE = Easing.out(Easing.cubic);

function confirmDelete(uuid: string, title: string) {
  Alert.alert('Delete chat?', `"${title}" will be removed from this device.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => void deleteChatThread(uuid) },
  ]);
}

function GroupLabel({ children }: { children: string }) {
  return <Caption className="mb-1 mt-6 px-3">{children}</Caption>;
}

function Row({
  label,
  icon,
  onPress,
  onLongPress,
  hint,
}: {
  label: string;
  icon?: LucideIcon;
  onPress: () => void;
  onLongPress?: () => void;
  hint?: string;
}) {
  return (
    <Tappable
      onPress={onPress}
      onLongPress={onLongPress}
      pressedOpacity={0.55}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      className="flex-row items-center gap-3 rounded-xl px-3 py-2.5">
      {icon ? <Icon icon={icon} size={18} color="foreground" /> : null}
      <Body numberOfLines={1} className="flex-1 font-medium">
        {label}
      </Body>
    </Tappable>
  );
}

/**
 * Ask's drawer (ASK-UI.md): search, Tools, Recents, then privacy and
 * settings, with New chat floating bottom-right (Claude's layout). Opens from
 * ☰ only (no edge swipe; that would fight Android's back gesture).
 * Long-press a chat to delete it.
 */
export function AskDrawer({ open, onClose, onNewChat }: { open: boolean; onClose: () => void; onNewChat: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const from = useAiEntry((s) => s.from);
  const { data: threads = [] } = useQuery(chatThreadsQuery);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  const bg = useThemeHex().background;
  const q = query.trim().toLowerCase();
  const matches = q ? threads.filter((t) => (t.title || 'Chat').toLowerCase().includes(q)) : threads;
  const shown = q || all ? matches : matches.slice(0, RECENT);
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
            style={{ paddingTop: insets.top + 12 }}>
            <View className="mx-4 h-11 flex-row items-center gap-2 rounded-full border border-input bg-surface1 px-4">
              <Icon icon={Search} size={16} color="muted-foreground" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search chats"
                placeholderTextColor={PLACEHOLDER_HEX}
                accessibilityLabel="Search chats"
                className="flex-1 text-base text-foreground"
                returnKeyType="search"
              />
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: insets.bottom + 88 }} keyboardShouldPersistTaps="handled">
              {q ? null : (
                <>
                  <GroupLabel>Tools</GroupLabel>
                  {TOOLS[from].map((t) => (
                    <Row key={t.title} label={t.title} icon={t.icon} onPress={() => go(t.href)} />
                  ))}
                </>
              )}

              <GroupLabel>{q ? 'Matching chats' : 'Recents'}</GroupLabel>
              {shown.length ? (
                shown.map((t) => (
                  <Row
                    key={t.uuid}
                    label={t.title || 'Chat'}
                    onPress={() => go(`/(app)/chat/${t.uuid}` as Href)}
                    onLongPress={() => confirmDelete(t.uuid, t.title || 'Chat')}
                    hint="Long press to delete"
                  />
                ))
              ) : (
                <Caption className="px-3 py-2">{q ? 'No chats match.' : 'Your chats stay on this device.'}</Caption>
              )}
              {!q && !all && matches.length > RECENT ? (
                <Tappable onPress={() => setAll(true)} pressedOpacity={0.55} accessibilityRole="button" className="px-3 py-2">
                  <Text className="text-sm font-medium text-muted-foreground">View all ›</Text>
                </Tappable>
              ) : null}

              <View className="mx-3 mt-5 h-px bg-hairline" />
              <View className="mt-3">
                <Tappable onPress={() => go('/(app)/ai-data-use' as Href)} pressedOpacity={0.55} accessibilityRole="button" className="px-3 py-2">
                  <Body className="text-muted-foreground">AI data use</Body>
                </Tappable>
                <Tappable onPress={() => go('/(app)/ai-settings' as Href)} pressedOpacity={0.55} accessibilityRole="button" className="px-3 py-2">
                  <Body className="text-muted-foreground">AI settings</Body>
                </Tappable>
              </View>
            </ScrollView>

            <View className="absolute right-4" style={{ bottom: insets.bottom + 16 }}>
              <Tappable
                onPress={() => {
                  onClose();
                  onNewChat();
                }}
                pressedOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="New chat"
                className="h-11 flex-row items-center gap-1.5 rounded-full bg-foreground px-4">
                <Icon icon={Plus} size={16} color={bg} />
                <Text className="text-sm font-semibold text-background">New chat</Text>
              </Tappable>
            </View>
          </Animated.View>
          <Animated.View entering={FadeIn.duration(motionDuration.enter)} exiting={FadeOut} className="flex-1 bg-black/40">
            <Pressable className="flex-1" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
          </Animated.View>
        </View>
      ) : null}
    </Modal>
  );
}
