import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown, Easing } from 'react-native-reanimated';
import { CalendarRange, SlidersHorizontal, X } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Caption } from '@/components/common/text';
import { ListGroup, ListRow, Section } from '@/components/layout';
import { Tappable } from '@/components/ui/tappable';
import { hasAnyConsent, useAiConsent } from '@/ai/consent';
import { useAiEntry, type AskContext } from '@/store/ai-entry-store';
import { motionDuration } from '@/styles/motion';

import { AiFallbackNotice } from './ai-fallback-notice';
import { AiHero } from './ai-hero';
import { AiMark } from './ai-mark';

type Suggestion = { title: string; subtitle: string; href: Href };

const ADJUST: Suggestion = { title: 'Adjust my program', subtitle: 'Load and volume from recent sessions', href: '/(app)/program-adjust' as Href };
const DELOAD: Suggestion = { title: 'Do I need a deload?', subtitle: 'Fatigue and missed reps', href: '/(app)/deload' as Href };
const BALANCE: Suggestion = { title: 'Which muscles am I missing?', subtitle: 'Sets per muscle this period', href: '/(app)/muscle-distribution' as Href };
const WEEK: Suggestion = { title: 'Summarise my week', subtitle: 'Volume, records and streak', href: '/(app)/report/week' as Href };
const MONTH: Suggestion = { title: 'How did this month go?', subtitle: 'Month report', href: '/(app)/report/month' as Href };

/** Suggestions lead with the screen the user came from. */
const BY_CONTEXT: Record<AskContext, Suggestion[]> = {
  index: [WEEK, DELOAD, ADJUST],
  workouts: [ADJUST, DELOAD, BALANCE],
  progress: [BALANCE, WEEK, MONTH],
  profile: [MONTH, WEEK, ADJUST],
};

/** Staggered rise for the blocks below the header. */
const rise = (i: number) =>
  FadeInDown.duration(motionDuration.enter)
    .delay(120 + i * 60)
    .easing(Easing.out(Easing.cubic));

/**
 * The one AI entry point: the separate tab on iOS, a full page from the
 * floating button on Android. Today it routes to the AI features that exist;
 * every change they make is a proposal the user approves.
 */
export function AskScreen({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const from = useAiEntry((s) => s.from);
  const consented = useAiConsent(hasAnyConsent);

  return (
    <View className="flex-1">
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-4 pb-10">
        {onClose ? (
          <View className="flex-row justify-end pt-2">
            <Tappable
              onPress={onClose}
              pressedOpacity={0.55}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              className="h-10 w-10 items-center justify-center rounded-full bg-surface2">
              <Icon icon={X} size={20} color="foreground" />
            </Tappable>
          </View>
        ) : null}

        <View className="mt-4">
          <AiHero />
          <Animated.View entering={rise(0)}>
            <Caption className="mt-3 px-1">Built from your logged training. Nothing changes until you approve it.</Caption>
          </Animated.View>
          {consented ? null : (
            <Animated.View entering={rise(0)} className="mt-4">
              <AiFallbackNotice reason="consent" />
            </Animated.View>
          )}
        </View>

        <Animated.View entering={rise(1)}>
          <Section title="Suggested">
            <ListGroup>
              {BY_CONTEXT[from].map((s) => (
                <ListRow key={s.title} title={s.title} subtitle={s.subtitle} onPress={() => router.push(s.href)} />
              ))}
            </ListGroup>
          </Section>
        </Animated.View>

        <Animated.View entering={rise(2)}>
          <Section title="Plans and routines">
            <ListGroup>
              <ListRow
                icon={<Icon icon={CalendarRange} size={18} color="muted-foreground" />}
                title="Build a plan"
                subtitle="A few weeks of training, made for you"
                onPress={() => router.push('/(app)/plan-builder' as Href)}
              />
              <ListRow
                icon={<Icon icon={AiMark} size={18} color="muted-foreground" />}
                title="Change a plan or routine by asking"
                subtitle="Open it from Workouts and ask"
                onPress={() => router.push('/(app)/(tabs)/workouts' as Href)}
              />
            </ListGroup>
          </Section>
        </Animated.View>

        <Animated.View entering={rise(3)}>
          <Section>
            <ListGroup>
              <ListRow
                icon={<Icon icon={SlidersHorizontal} size={18} color="muted-foreground" />}
                title="AI settings"
                onPress={() => router.push('/(app)/ai-settings' as Href)}
              />
            </ListGroup>
          </Section>
        </Animated.View>
      </ScrollView>
    </View>
  );
}
