import { useRouter, type Href } from 'expo-router';
import { View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { Icon } from '@/components/common/icon';
import { Caption, Text } from '@/components/common/text';
import { Tappable } from '@/components/ui/tappable';
import type { AnswerCard } from '@/ai/chat-turn';
import type { MuscleGroup } from '@/db/types';
import { cn } from '@/lib/cn';
import { MUSCLE_LABELS } from '@/lib/labels';
import { hexToRgba, useThemeHex } from '@/lib/theme';

/**
 * The answer-card catalog (ASK-UI.md T1). One look for all of them: a
 * surface1 card, a caption naming what was read, numbers in tabular figures,
 * one chart language (primary line or bar, muted reference). Data comes from
 * `answerCardsFor` (our tool results), never the model's text.
 */
export function AnswerCardView({ card }: { card: AnswerCard }) {
  switch (card.kind) {
    case 'trend':
      return <TrendCardView card={card} />;
    case 'records':
      return <RecordsCard card={card} />;
    case 'muscles':
      return <MusclesCard card={card} />;
    case 'workouts':
      return <WorkoutsCard card={card} />;
  }
}

function Shell({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <View className="rounded-2xl border border-hairline bg-surface1 px-4 py-3" accessible accessibilityLabel={label}>
      {children}
    </View>
  );
}

/** e1RM over the sessions the answer read. */
function TrendCardView({ card }: { card: Extract<AnswerCard, { kind: 'trend' }> }) {
  const W = 260;
  const H = 56;
  const min = Math.min(...card.points);
  const max = Math.max(...card.points);
  const span = max - min || 1;
  const xy = card.points.map((v, i) => [(i / (card.points.length - 1)) * (W - 8) + 4, H - 6 - ((v - min) / span) * (H - 12)] as const);
  const lastPt = xy[xy.length - 1]!;
  const up = card.points[card.points.length - 1]! >= card.points[0]!;
  const primary = useThemeHex().primary;
  return (
    <Shell label={`${card.exercise} estimated max over ${card.points.length} sessions, from ${card.points[0]} to ${card.points.at(-1)} ${card.unit}`}>
      <View className="flex-row items-baseline justify-between">
        <Caption>
          {card.exercise} e1RM · {card.points.length} sessions
        </Caption>
        <Text className={cn('text-xs font-semibold tabular-nums', up ? 'text-success' : 'text-muted-foreground')}>
          {card.points[0]} → {card.points.at(-1)} {card.unit}
        </Text>
      </View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2">
        <Polyline points={xy.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={hexToRgba(primary, 0.55)} strokeWidth={2} strokeLinejoin="round" />
        <Circle cx={lastPt[0]} cy={lastPt[1]} r={3.5} fill={primary} />
      </Svg>
    </Shell>
  );
}

function RecordsCard({ card }: { card: Extract<AnswerCard, { kind: 'records' }> }) {
  return (
    <Shell label={`Best estimated maxes: ${card.rows.map((r) => `${r.exercise} ${r.value} ${card.unit}`).join(', ')}`}>
      <Caption>Best estimated 1RM</Caption>
      <View className="mt-2 gap-2">
        {card.rows.map((r) => (
          <View key={r.exercise} className="flex-row items-baseline justify-between gap-3">
            <Text numberOfLines={1} className="flex-1 text-sm text-foreground">
              {r.exercise}
            </Text>
            <Text className="text-base font-semibold tabular-nums text-foreground">
              {r.value}
              <Text className="text-xs font-normal text-muted-foreground"> {card.unit}</Text>
            </Text>
          </View>
        ))}
      </View>
    </Shell>
  );
}

/** Weekly sets per muscle, with a muted tick at 10 (the usual low end of a growth range). */
const SET_REFERENCE = 10;

function muscleLabel(m: string): string {
  return MUSCLE_LABELS[m as MuscleGroup] ?? m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, ' ');
}

function MusclesCard({ card }: { card: Extract<AnswerCard, { kind: 'muscles' }> }) {
  const scale = Math.max(SET_REFERENCE * 2, ...card.rows.map((r) => r.average));
  const tick = `${(SET_REFERENCE / scale) * 100}%` as const;
  return (
    <Shell label={`Sets per week over ${card.weeks} weeks: ${card.rows.map((r) => `${muscleLabel(r.muscle)} ${r.average}`).join(', ')}`}>
      <View className="flex-row items-baseline justify-between">
        <Caption>Sets per week · last {card.weeks} weeks</Caption>
        <Caption className="text-xs">tick = {SET_REFERENCE} sets</Caption>
      </View>
      <View className="mt-2 gap-2">
        {card.rows.map((r) => (
          <View key={r.muscle} className="flex-row items-center gap-3">
            <Text numberOfLines={1} className="w-20 text-xs text-muted-foreground">
              {muscleLabel(r.muscle)}
            </Text>
            <View className="h-2 flex-1 justify-center">
              <View className="h-2 overflow-hidden rounded-full bg-surface3">
                <View className={cn('h-2 rounded-full', r.average >= SET_REFERENCE ? 'bg-primary' : 'bg-primary/45')} style={{ width: `${(r.average / scale) * 100}%` }} />
              </View>
              <View className="absolute h-3.5 w-px bg-muted-foreground/60" style={{ left: tick }} />
            </View>
            <Text className="w-8 text-right text-xs font-semibold tabular-nums text-foreground">{r.average}</Text>
          </View>
        ))}
      </View>
    </Shell>
  );
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** Recent workouts the answer read; each row opens that workout. */
function WorkoutsCard({ card }: { card: Extract<AnswerCard, { kind: 'workouts' }> }) {
  const router = useRouter();
  return (
    <View className="overflow-hidden rounded-2xl border border-hairline bg-surface1">
      {card.rows.map((w, i) => (
        <Tappable
          key={w.id}
          onPress={() => router.push(`/summary/${w.id}` as Href)}
          pressedOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={`${w.name}, ${shortDate(w.date)}, ${w.minutes} minutes, ${w.sets} sets. Open workout`}
          className={cn('flex-row items-center gap-3 px-4 py-3', i > 0 && 'border-t border-hairline')}>
          <View className="flex-1">
            <Text numberOfLines={1} className="text-sm font-medium text-foreground">
              {w.name}
            </Text>
            <Caption>
              {shortDate(w.date)} · {w.minutes} min · {w.sets} sets
            </Caption>
          </View>
          <Icon icon={ChevronRight} size={16} color="muted-foreground" />
        </Tappable>
      ))}
    </View>
  );
}
