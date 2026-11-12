import { useState } from 'react';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { ChevronRight, Menu, SquarePen, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { Icon } from '@/components/common/icon';
import { Body, Caption, Heading, Subtitle, Text } from '@/components/common/text';
import { ListGroup, ListRow, Section, SectionLabel } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Tappable } from '@/components/ui/tappable';
import { hasAnyConsent, useAiConsent } from '@/ai/consent';
import type { Insight } from '@/ai/ask-brief';
import { useSuggestedTemplate, useTodayProgramSlot } from '@/hooks/use-data';
import { askBriefQuery, chatThreadsQuery } from '@/lib/query-keys';
import { cn } from '@/lib/cn';
import { newUuid } from '@/lib/uuid';
import { useAiEntry, type AskContext } from '@/store/ai-entry-store';
import { motionDuration } from '@/styles/motion';
import type { TemplateExercise } from '@/db/types';

import { AiFallbackNotice } from './ai-fallback-notice';
import { AiHero } from './ai-hero';
import { AskAmbient } from './ask-ambient';
import { AskComposer } from './ask-composer';
import { AskDrawer } from './ask-drawer';
import { SuggestionChip } from './suggestion-chip';

/** Shown when there isn't enough data for insights (new users). */
const STARTERS = ["How's my bench going?", 'What are my best lifts?', 'Am I training enough?'];

type Door = { title: string; subtitle: string; href: Href };
const ADJUST: Door = { title: 'Adjust my program', subtitle: 'Load and volume from recent sessions', href: '/(app)/program-adjust' as Href };
const DELOAD: Door = { title: 'Do I need a deload?', subtitle: 'Fatigue and missed reps', href: '/(app)/deload' as Href };
const BALANCE: Door = { title: 'Which muscles am I missing?', subtitle: 'Sets per muscle this period', href: '/(app)/muscle-distribution' as Href };
const WEEK: Door = { title: 'Summarise my week', subtitle: 'Volume, records and streak', href: '/(app)/report/week' as Href };
const MONTH: Door = { title: 'How did this month go?', subtitle: 'Month report', href: '/(app)/report/month' as Href };

/** Doors lead with the screen the user came from. */
const DOORS: Record<AskContext, Door[]> = {
  index: [WEEK, DELOAD, ADJUST],
  workouts: [ADJUST, DELOAD, BALANCE],
  progress: [BALANCE, WEEK, MONTH],
  profile: [MONTH, WEEK, ADJUST],
};

const TONE = { up: 'text-success', warn: 'text-warning', neutral: 'text-muted-foreground' } as const;

const rise = (i: number) =>
  FadeInDown.duration(motionDuration.enter)
    .delay(80 + i * 50)
    .easing(Easing.out(Easing.cubic));

function stamp(now = new Date()): string {
  const day = now.toLocaleDateString(undefined, { weekday: 'short' });
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} ${time}`;
}

function HeaderButton({ icon, label, onPress }: { icon: typeof Menu; label: string; onPress: () => void }) {
  return (
    <Tappable
      onPress={onPress}
      pressedOpacity={0.55}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      className="h-10 w-10 items-center justify-center rounded-full">
      <Icon icon={icon} size={21} color="foreground" />
    </Tappable>
  );
}

/** One "Worth a look" tile: the number (from our calc), its change in colour, tap to ask about it. */
function StatTile({ insight, onPress }: { insight: Insight; onPress: () => void }) {
  const { stat } = insight;
  return (
    <Tappable
      onPress={onPress}
      pressedOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${stat.label} ${stat.value} ${stat.unit ?? ''}, ${stat.delta}. Ask: ${insight.question}`}
      className="min-h-28 flex-1 justify-between rounded-2xl border border-hairline bg-surface1 p-3.5">
      <Caption numberOfLines={2}>{stat.label}</Caption>
      <View>
        <View className="mt-2 flex-row items-baseline gap-1">
          <Text className="text-2xl font-semibold tabular-nums text-foreground">{stat.value}</Text>
          {stat.unit ? <Caption>{stat.unit}</Caption> : null}
        </View>
        <Text numberOfLines={1} className={cn('mt-0.5 text-xs font-medium', TONE[stat.tone])}>
          {stat.delta}
        </Text>
      </View>
    </Tappable>
  );
}

function exerciseLine(te: TemplateExercise): string | null {
  const name = te.exercise?.name;
  if (!name) return null;
  const reps = te.targetRepsMin === te.targetRepsMax ? `${te.targetRepsMin}` : `${te.targetRepsMin}–${te.targetRepsMax}`;
  return `${name} ${te.targetSets}×${reps}`;
}

/** What's next, compact: name, time, the first two lifts, one action. Starting runs through the workout screen (conflict handling lives there). */
function NextCard({ id, name, minutes, exercises }: { id: number; name: string; minutes?: number; exercises: TemplateExercise[] }) {
  const router = useRouter();
  const lines = exercises.map(exerciseLine).filter((l): l is string => !!l);
  return (
    <View className="rounded-2xl border border-hairline bg-surface1 p-4">
      <View className="flex-row items-baseline justify-between">
        <Subtitle numberOfLines={1} className="flex-1">
          {name}
        </Subtitle>
        {minutes ? <Caption>{minutes} min</Caption> : null}
      </View>
      {lines.length ? (
        <View className="mt-1.5 gap-0.5">
          {lines.slice(0, 2).map((l) => (
            <Body key={l} className="text-muted-foreground" numberOfLines={1}>
              {l}
            </Body>
          ))}
          {lines.length > 2 ? <Caption>+{lines.length - 2} more</Caption> : null}
        </View>
      ) : null}
      <Button className="mt-3" onPress={() => router.push(`/workout/${id}` as Href)}>
        Start workout
      </Button>
    </View>
  );
}

/**
 * Ask (ASK-UI.md "The shell"): ambient dither header, what's next, the
 * rules-built "Worth a look" tiles, the doors into Ask's tools, and the
 * composer pinned at the bottom. History lives in the drawer.
 */
export function AskScreen({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const from = useAiEntry((s) => s.from);
  const consented = useAiConsent(hasAnyConsent);
  const { data: brief } = useQuery(askBriefQuery);
  const { data: threads = [] } = useQuery(chatThreadsQuery);
  const { data: slot } = useTodayProgramSlot();
  const { data: suggested } = useSuggestedTemplate();
  const [drawer, setDrawer] = useState(false);
  const [draft, setDraft] = useState('');
  const [now] = useState(stamp);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const last = threads[0];

  const openChat = (q?: string) => {
    const text = q?.trim();
    router.push(`/(app)/chat/${newUuid()}${text ? `?q=${encodeURIComponent(text)}` : ''}` as Href);
  };
  const send = (t: string) => {
    if (!t.trim()) return;
    openChat(t);
    setDraft('');
  };

  const programWorkout = slot && !slot.isRestDay ? slot.workout : null;
  const next = programWorkout
    ? {
        id: programWorkout.templateId,
        name: programWorkout.templateName ?? 'Workout',
        minutes: programWorkout.estimatedMinutes,
        exercises: programWorkout.template?.exercises ?? [],
      }
    : suggested
      ? { id: suggested.id, name: suggested.name, minutes: suggested.estimatedMinutes, exercises: suggested.exercises ?? [] }
      : null;

  const cards = brief?.cards ?? [];
  const headline = slot?.isRestDay ? 'Rest day today' : next ? `${next.name} is next` : (brief?.headline ?? 'Ask about your training');
  const tiles = cards.slice(0, 2);

  return (
    <View className="flex-1 bg-background">
      <AskAmbient scene={brief?.scene ?? 'mark'} scrollY={scrollY} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-row items-center px-2 pt-1" style={{ marginTop: insets.top }}>
          <HeaderButton icon={Menu} label="Chats and tools" onPress={() => setDrawer(true)} />
          <Subtitle className="flex-1 text-center">Ask</Subtitle>
          <HeaderButton icon={SquarePen} label="New chat" onPress={() => openChat()} />
          {onClose ? <HeaderButton icon={X} label="Close" onPress={onClose} /> : null}
        </View>

        <Animated.ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pb-6 pt-3"
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={16}>
          <Animated.View entering={rise(0)}>
            <Caption>{now}</Caption>
            <Heading className="mt-1" accessibilityRole="header">
              {headline}
            </Heading>
            {next && brief?.cards.length ? <Body className="mt-1 text-muted-foreground">{brief.headline}</Body> : null}
          </Animated.View>

          {consented ? null : (
            <Animated.View entering={rise(1)} className="mt-4">
              <AiFallbackNotice reason="consent" />
            </Animated.View>
          )}

          {next ? (
            <Animated.View entering={rise(1)} className="mt-4">
              <NextCard {...next} />
            </Animated.View>
          ) : null}

          {tiles.length ? (
            <Animated.View entering={rise(2)} className="mt-6">
              <SectionLabel>Worth a look</SectionLabel>
              <View className="flex-row gap-2.5">
                {tiles.map((c) => (
                  <StatTile key={c.question} insight={c} onPress={() => openChat(c.question)} />
                ))}
                {tiles.length === 1 ? <View className="flex-1" /> : null}
              </View>
              {cards[2] ? (
                <Tappable
                  onPress={() => openChat(cards[2]!.question)}
                  pressedOpacity={0.6}
                  accessibilityRole="button"
                  className="mt-2.5 flex-row items-center gap-2 rounded-2xl border border-hairline bg-surface1 px-3.5 py-3">
                  <View className="flex-1">
                    <View className="flex-row items-baseline justify-between gap-2">
                      <Caption numberOfLines={1} className="flex-1">
                        {cards[2].stat.label}
                      </Caption>
                      <Text className={cn('text-xs font-medium', TONE[cards[2].stat.tone])}>{cards[2].stat.delta}</Text>
                    </View>
                    <Body className="mt-0.5 font-medium">{cards[2].question}</Body>
                  </View>
                  <Icon icon={ChevronRight} size={16} color="muted-foreground" />
                </Tappable>
              ) : null}
            </Animated.View>
          ) : brief ? (
            <Animated.View entering={rise(2)} className="mt-6 flex-row flex-wrap gap-2">
              {STARTERS.map((q) => (
                <SuggestionChip key={q} label={q} onPress={() => openChat(q)} />
              ))}
            </Animated.View>
          ) : null}

          {last ? (
            <Animated.View entering={rise(3)} className="mt-3">
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

          <Animated.View entering={rise(3)}>
            <Section title="Suggested">
              <ListGroup>
                {DOORS[from].map((d) => (
                  <ListRow key={d.title} title={d.title} subtitle={d.subtitle} onPress={() => router.push(d.href)} />
                ))}
              </ListGroup>
            </Section>
          </Animated.View>

          <Animated.View entering={rise(4)} className="mt-6">
            <AiHero
              compact
              title="Build a plan"
              subtitle="A few weeks of training, made for you"
              onPress={() => router.push('/(app)/plan-builder' as Href)}
            />
            <Tappable
              onPress={() => router.push('/(app)/(tabs)/workouts' as Href)}
              pressedOpacity={0.6}
              accessibilityRole="button"
              className="mt-2 flex-row items-center gap-2 px-1 py-2">
              <Body className="flex-1 text-muted-foreground">Change a plan or routine by asking: open it from Workouts</Body>
              <Icon icon={ChevronRight} size={16} color="muted-foreground" />
            </Tappable>
          </Animated.View>
        </Animated.ScrollView>

        <View className="px-4 pt-1" style={{ paddingBottom: insets.bottom + 6 }}>
          <AskComposer value={draft} onChangeText={setDraft} onSend={send} footnote="Answers use your logged data and can be wrong." />
        </View>
      </KeyboardAvoidingView>

      <AskDrawer open={drawer} onClose={() => setDrawer(false)} onNewChat={() => openChat()} />
    </View>
  );
}
