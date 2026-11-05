import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Caption, Heading } from '@/components/common/text';
import { ListGroup, ListRow, Section } from '@/components/layout';
import { useAiEntry, type AskContext } from '@/store/ai-entry-store';

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

/**
 * The one AI entry point: the separate tab on iOS, the floating button's
 * sheet on Android. Today it routes to the AI features that exist; free-form
 * requests arrive with Templates AI (WORK-QUEUE step 2), and every change
 * they make is a proposal the user approves.
 */
export function AskScreen({ topInset = 0 }: { topInset?: number }) {
  const router = useRouter();
  const from = useAiEntry((s) => s.from);
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerClassName="px-4 pb-10" style={{ paddingTop: topInset }}>
      <View className="mt-4 flex-row items-center gap-2">
        <Icon icon={Sparkles} size={22} color="primary" />
        <Heading>Ask Incline</Heading>
      </View>
      <Caption className="mt-1">Suggestions use your logged training. Nothing changes until you approve it.</Caption>

      <Section title="Suggested">
        <ListGroup>
          {BY_CONTEXT[from].map((s) => (
            <ListRow key={s.title} title={s.title} subtitle={s.subtitle} onPress={() => router.push(s.href)} />
          ))}
        </ListGroup>
      </Section>

      <Section title="Routines">
        <ListGroup>
          <ListRow
            title="Edit a routine by asking"
            subtitle="Open a routine and tap Edit, or start a new one"
            onPress={() => router.push('/(app)/(tabs)/workouts' as Href)}
          />
        </ListGroup>
      </Section>

      <Section>
        <ListGroup>
          <ListRow title="AI settings" onPress={() => router.push('/(app)/ai-settings' as Href)} />
        </ListGroup>
      </Section>
    </ScrollView>
  );
}
