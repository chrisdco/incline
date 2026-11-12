import { useState } from 'react';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { ArrowUp, ChevronRight, Menu, SquarePen, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { Icon } from '@/components/common/icon';
import { Body, Caption, Label, Title } from '@/components/common/text';
import { Input } from '@/components/ui/input';
import { Tappable } from '@/components/ui/tappable';
import { hasAnyConsent, useAiConsent } from '@/ai/consent';
import type { Insight } from '@/ai/ask-brief';
import { askBriefQuery, chatThreadsQuery } from '@/lib/query-keys';
import { cn } from '@/lib/cn';
import { newUuid } from '@/lib/uuid';
import { motionDuration } from '@/styles/motion';

import { AiFallbackNotice } from './ai-fallback-notice';
import { AskAmbient, AskMark } from './ask-ambient';
import { AskDrawer } from './ask-drawer';
import { SuggestionChip } from './suggestion-chip';

/** Shown when there isn't enough data for insights (new users), or under them. */
const STARTERS = ["How's my bench going?", 'What are my best lifts?', 'Am I training enough?'];

const rise = (i: number) =>
  FadeInDown.duration(motionDuration.enter)
    .delay(120 + i * 60)
    .easing(Easing.out(Easing.cubic));

function HeaderButton({ icon, label, onPress }: { icon: typeof Menu; label: string; onPress: () => void }) {
  return (
    <Tappable
      onPress={onPress}
      pressedOpacity={0.55}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      className="h-10 w-10 items-center justify-center rounded-full">
      <Icon icon={icon} size={22} color="foreground" />
    </Tappable>
  );
}

/** An insight: the number (from our calc) over the question it asks. */
function InsightCard({ insight, onPress }: { insight: Insight; onPress: () => void }) {
  return (
    <Tappable
      onPress={onPress}
      pressedOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${insight.metric}. ${insight.question}`}
      className="flex-row items-center gap-3 rounded-2xl border border-hairline bg-surface1 px-4 py-3.5">
      <View className="min-w-0 flex-1">
        <Label className="text-muted-foreground" numberOfLines={1}>
          {insight.metric}
        </Label>
        <Body className="mt-0.5 font-medium">{insight.question}</Body>
      </View>
      <Icon icon={ChevronRight} size={18} color="muted-foreground" />
    </Tappable>
  );
}

/**
 * Ask (ASK-UI.md "The shell"): an ambient dither header, a rules-built idle
 * brief (headline, insight cards, continue), and the composer pinned at the
 * bottom. History and tools live in the drawer. Home is for doing; this is
 * for understanding, so the one action here is asking.
 */
export function AskScreen({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const consented = useAiConsent(hasAnyConsent);
  const { data: brief } = useQuery(askBriefQuery);
  const { data: threads = [] } = useQuery(chatThreadsQuery);
  const insets = useSafeAreaInsets();
  const [drawer, setDrawer] = useState(false);
  const [draft, setDraft] = useState('');
  const last = threads[0];

  const openChat = (q?: string) => {
    const text = q?.trim();
    router.push(`/(app)/chat/${newUuid()}${text ? `?q=${encodeURIComponent(text)}` : ''}` as Href);
  };
  const send = () => {
    if (!draft.trim()) return;
    openChat(draft);
    setDraft('');
  };

  const cards = brief?.cards ?? [];
  const starters = cards.length ? [] : STARTERS;

  return (
    <View className="flex-1 bg-background">
      <AskAmbient scene={brief?.scene ?? 'mark'} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-row items-center justify-between px-2 pt-1" style={{ marginTop: insets.top }}>
          <HeaderButton icon={Menu} label="Chats and tools" onPress={() => setDrawer(true)} />
          <View className="flex-row">
            <HeaderButton icon={SquarePen} label="New chat" onPress={() => openChat()} />
            {onClose ? <HeaderButton icon={X} label="Close" onPress={onClose} /> : null}
          </View>
        </View>

        <ScrollView className="flex-1" contentContainerClassName="px-4 pb-6" keyboardShouldPersistTaps="handled">
          <View className="items-center pt-6">
            <AskMark />
            <Animated.View entering={rise(0)}>
              <Title className="mt-4 text-center" accessibilityRole="header">
                {brief?.headline ?? 'Ask about your training'}
              </Title>
            </Animated.View>
            {brief && !cards.length ? (
              <Animated.View entering={rise(0)}>
                <Caption className="mt-2 text-center">
                  {brief.sessions
                    ? 'Log a few more workouts and Ask will point out what changed.'
                    : 'Answers come from your logged workouts.'}
                </Caption>
              </Animated.View>
            ) : null}
          </View>

          {consented ? null : (
            <Animated.View entering={rise(1)} className="mt-6">
              <AiFallbackNotice reason="consent" />
            </Animated.View>
          )}

          {cards.length ? (
            <Animated.View entering={rise(1)} className="mt-8 gap-2.5">
              {cards.map((c) => (
                <InsightCard key={c.question} insight={c} onPress={() => openChat(c.question)} />
              ))}
            </Animated.View>
          ) : null}

          {starters.length ? (
            <Animated.View entering={rise(1)} className="mt-8 flex-row flex-wrap justify-center gap-2">
              {starters.map((q) => (
                <SuggestionChip key={q} label={q} onPress={() => openChat(q)} />
              ))}
            </Animated.View>
          ) : null}

          {last ? (
            <Animated.View entering={rise(2)} className="mt-4">
              <Tappable
                onPress={() => router.push(`/(app)/chat/${last.uuid}` as Href)}
                pressedOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Continue: ${last.title || 'Chat'}`}
                className="flex-row items-center gap-2 px-1 py-2">
                <Caption>Continue</Caption>
                <Body numberOfLines={1} className="flex-1 text-muted-foreground">
                  {last.title || 'Chat'}
                </Body>
                <Icon icon={ChevronRight} size={16} color="muted-foreground" />
              </Tappable>
            </Animated.View>
          ) : null}
        </ScrollView>

        <View className="px-4 pb-2 pt-1">
          <View className="flex-row items-end gap-2">
            <Input
              className="max-h-32 min-h-12 flex-1 bg-surface1 py-3"
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask about your training"
              multiline
              maxLength={1000}
              accessibilityLabel="Your question"
            />
            <Tappable
              onPress={send}
              disabled={!draft.trim()}
              pressedOpacity={0.55}
              accessibilityRole="button"
              accessibilityLabel="Send"
              className={cn('h-12 w-12 items-center justify-center rounded-full bg-primary', !draft.trim() && 'opacity-40')}>
              <Icon icon={ArrowUp} size={20} color="primary-foreground" />
            </Tappable>
          </View>
          <Caption className="mt-1.5 text-center">Answers use your logged data and can be wrong.</Caption>
        </View>
      </KeyboardAvoidingView>

      <AskDrawer open={drawer} onClose={() => setDrawer(false)} onNewChat={() => openChat()} />
    </View>
  );
}
