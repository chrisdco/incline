import { useState } from 'react';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { BlurTargetView } from 'expo-blur';
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  Gauge,
  Menu,
  MessageSquare,
  Scale,
  SlidersHorizontal,
  SquarePen,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { Icon } from '@/components/common/icon';
import { Body, Caption, Label, Subtitle, Text } from '@/components/common/text';
import { ListGroup, ListRow, SectionLabel } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { EdgeBlur, useBlurTarget } from '@/components/ui/edge-blur';
import { Tappable } from '@/components/ui/tappable';
import { hasAnyConsent, useAiConsent } from '@/ai/consent';
import type { Insight } from '@/ai/ask-brief';
import { useSuggestedTemplate, useTodayProgramSlot } from '@/hooks/use-data';
import { askBriefQuery, chatThreadsQuery } from '@/lib/query-keys';
import { cn } from '@/lib/cn';
import { newUuid } from '@/lib/uuid';
import { useAiEntry, type AskContext } from '@/store/ai-entry-store';
import type { TemplateExercise } from '@/db/types';

import { AiFallbackNotice } from './ai-fallback-notice';
import { AiHero } from './ai-hero';
import { AskAmbient } from './ask-ambient';
import { AskComposer } from './ask-composer';
import { AskDrawer } from './ask-drawer';
import { SuggestionChip } from './suggestion-chip';

/** Shown when there isn't enough data for insights (new users). */
const STARTERS = ["How's my bench going?", 'What are my best lifts?', 'Am I training enough?'];

type Door = { title: string; icon: LucideIcon; href: Href };
const ADJUST: Door = { title: 'Adjust my program', icon: SlidersHorizontal, href: '/(app)/program-adjust' as Href };
const DELOAD: Door = { title: 'Do I need a deload?', icon: Gauge, href: '/(app)/deload' as Href };
const BALANCE: Door = { title: 'Which muscles am I missing?', icon: Scale, href: '/(app)/muscle-distribution' as Href };
const WEEK: Door = { title: 'Summarise my week', icon: BarChart3, href: '/(app)/report/week' as Href };
const MONTH: Door = { title: 'How did this month go?', icon: CalendarDays, href: '/(app)/report/month' as Href };

/** Doors lead with the screen the user came from. */
const DOORS: Record<AskContext, Door[]> = {
  index: [WEEK, DELOAD, ADJUST],
  workouts: [ADJUST, DELOAD, BALANCE],
  progress: [BALANCE, WEEK, MONTH],
  profile: [MONTH, WEEK, ADJUST],
};

/** Header row height below the status bar; content starts under it and scrolls beneath. */
const HEADER_H = 52;
/** Floating composer: pill height plus its gap above the home indicator. */
const DOCK_H = 64;

const TONE = { up: 'text-success', warn: 'text-warning', neutral: 'text-muted-foreground' } as const;


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

/**
 * What's next, compact: the heading above already names it, so the card is
 * the plan (first lifts, time) and the one primary action on the screen.
 * Starting runs through the workout screen (conflict handling lives there).
 */
function NextCard({ id, minutes, exercises }: { id: number; minutes?: number; exercises: TemplateExercise[] }) {
  const router = useRouter();
  const lines = exercises.map(exerciseLine).filter((l): l is string => !!l);
  const meta = [`${exercises.length} exercises`, minutes ? `~${minutes} min` : null].filter(Boolean).join(' · ');
  return (
    <View className="rounded-2xl border border-hairline bg-surface1 p-4">
      <Label>{meta}</Label>
      {lines.length ? (
        <View className="mt-2 gap-1">
          {lines.slice(0, 3).map((l) => (
            <Body key={l} numberOfLines={1}>
              {l}
            </Body>
          ))}
          {lines.length > 3 ? <Caption>+{lines.length - 3} more</Caption> : null}
        </View>
      ) : null}
      <Button className="mt-4" onPress={() => router.push(`/workout/${id}` as Href)}>
        Start workout
      </Button>
    </View>
  );
}

/**
 * Ask (ASK-UI.md "The shell"): ambient dither header, what's next, the
 * rules-built "Worth a look" tiles, the doors into Ask's tools, and the
 * floating composer. History lives in the drawer.
 *
 * Hierarchy, top to bottom: the headline (largest), one primary action
 * (Start workout), numbers worth a look, then quieter ways in (rows), then
 * the brand card. Content scrolls under the header and the composer and
 * dissolves there (EdgeBlur) instead of being cut.
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
  const target = useBlurTarget();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  // The top edge only frosts once something has scrolled under the header.
  const topFade = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [0, 32], [0, 1], Extrapolation.CLAMP) }));
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
  const third = cards[2];

  return (
    <View className="flex-1 bg-background">
      <AskAmbient scene={brief?.scene ?? 'mark'} scrollY={scrollY} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <BlurTargetView ref={target} style={{ flex: 1 }}>
          <Animated.ScrollView
            className="flex-1"
            contentContainerClassName="px-4"
            contentContainerStyle={{ paddingTop: insets.top + HEADER_H + 12, paddingBottom: insets.bottom + DOCK_H + 32 }}
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={16}>
            <View>
              <Label>{now}</Label>
              <Text className="mt-2 text-3xl font-bold tracking-tight text-foreground" accessibilityRole="header">
                {headline}
              </Text>
            </View>

            {consented ? null : (
              <View className="mt-5">
                <AiFallbackNotice reason="consent" />
              </View>
            )}

            {next ? (
              <View className="mt-5">
                <NextCard id={next.id} minutes={next.minutes} exercises={next.exercises} />
              </View>
            ) : null}

            {tiles.length ? (
              <View className="mt-8">
                <SectionLabel>Worth a look</SectionLabel>
                <View className="flex-row gap-2.5">
                  {tiles.map((c) => (
                    <StatTile key={c.question} insight={c} onPress={() => openChat(c.question)} />
                  ))}
                  {tiles.length === 1 ? <View className="flex-1" /> : null}
                </View>
                {third ? (
                  <Tappable
                    onPress={() => openChat(third.question)}
                    pressedOpacity={0.6}
                    accessibilityRole="button"
                    className="mt-2.5 flex-row items-center gap-3 rounded-2xl border border-hairline bg-surface1 px-3.5 py-3">
                    <View className="flex-1">
                      <Caption numberOfLines={1}>
                        {third.stat.label} · <Text className={cn('text-sm font-medium', TONE[third.stat.tone])}>{third.stat.delta}</Text>
                      </Caption>
                      <Subtitle className="mt-0.5">{third.question}</Subtitle>
                    </View>
                    <Icon icon={ChevronRight} size={16} color="muted-foreground" />
                  </Tappable>
                ) : null}
              </View>
            ) : brief ? (
              <View className="mt-8">
                <SectionLabel>Try asking</SectionLabel>
                <View className="flex-row flex-wrap gap-2">
                  {STARTERS.map((q) => (
                    <SuggestionChip key={q} label={q} onPress={() => openChat(q)} />
                  ))}
                </View>
              </View>
            ) : null}

            <View className="mt-8">
              <SectionLabel>Jump in</SectionLabel>
              <ListGroup>
                {last ? (
                  <ListRow
                    icon={<Icon icon={MessageSquare} size={18} color="muted-foreground" />}
                    title={last.title || 'Chat'}
                    subtitle="Continue chat"
                    onPress={() => router.push(`/(app)/chat/${last.uuid}` as Href)}
                  />
                ) : null}
                {DOORS[from].map((d) => (
                  <ListRow
                    key={d.title}
                    icon={<Icon icon={d.icon} size={18} color="muted-foreground" />}
                    title={d.title}
                    onPress={() => router.push(d.href)}
                  />
                ))}
              </ListGroup>
            </View>

            <View className="mt-8">
              <AiHero
                compact
                title="Build a plan"
                subtitle="A few weeks of training, made for you"
                onPress={() => router.push('/(app)/plan-builder' as Href)}
              />
              <Caption className="mt-6 text-center">Answers use your logged data and can be wrong.</Caption>
            </View>
          </Animated.ScrollView>
        </BlurTargetView>

        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, topFade]}>
          <EdgeBlur edge="top" height={insets.top + HEADER_H + 16} target={target} veil={0.96} style={{ position: 'relative' }} />
        </Animated.View>
        <View className="absolute left-0 right-0 flex-row items-center px-2" style={{ top: insets.top, height: HEADER_H }}>
          <HeaderButton icon={Menu} label="Chats and tools" onPress={() => setDrawer(true)} />
          <Subtitle className="flex-1 text-center">Ask</Subtitle>
          <HeaderButton icon={SquarePen} label="New chat" onPress={() => openChat()} />
          {onClose ? <HeaderButton icon={X} label="Close" onPress={onClose} /> : null}
        </View>

        <EdgeBlur edge="bottom" height={insets.bottom + DOCK_H + 28} target={target} />
        <View className="absolute left-0 right-0 px-3" style={{ bottom: insets.bottom + 8 }}>
          <AskComposer value={draft} onChangeText={setDraft} onSend={send} blurTarget={target} />
        </View>
      </KeyboardAvoidingView>

      <AskDrawer open={drawer} onClose={() => setDrawer(false)} onNewChat={() => openChat()} />
    </View>
  );
}
