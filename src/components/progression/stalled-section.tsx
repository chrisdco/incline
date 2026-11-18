import { useRouter, type Href } from 'expo-router';
import { View } from 'react-native';

import { AskAboutLink } from '@/components/ai/ask-about-button';
import { ListRow, Section } from '@/components/layout';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { decisionSourceLabel, REMEDY_LABEL } from '@/contracts/coaching/progression';
import { planText } from '@/contracts/mcp/shape';
import type { ProgressionReview } from '@/db/queries/progression';
import { useSettings } from '@/store/settings-store';

export function progressionHref(exerciseKey: string): Href {
  return `/progression/${encodeURIComponent(exerciseKey)}` as Href;
}

/**
 * Progress → "Stalled lifts" (PROGRESSION.md §7): each stalled lift with
 * Incline's fix and where it stands, plus suggestions waiting from Ask,
 * Claude or the web. Hidden when there is nothing to show.
 */
export function StalledSection({ review }: { review: ProgressionReview | null }) {
  const router = useRouter();
  const autonomy = useSettings((s) => s.progressionAutonomy);
  if (!review) return null;
  const { findings, inbox, unit } = review;
  const findingKeys = new Set(findings.map((f) => f.exerciseKey));
  const loose = inbox.filter((d) => !findingKeys.has(d.exerciseKey));
  if (findings.length === 0 && loose.length === 0) return null;

  return (
    <Section
      title="Stalled lifts"
      first
      action={
        findings.length ? (
          <AskAboutLink
            about={{ kind: 'insight', label: `Stalled: ${findings.map((f) => f.name).join(', ')}`.slice(0, 80) }}
            question="How do I get these lifts moving again?"
          />
        ) : undefined
      }>
      <Card className="py-1">
        {findings.map((f, i) => {
          const pending = inbox.find((d) => d.exerciseKey === f.exerciseKey);
          const subtitle =
            f.status === 'applied'
              ? `Fix applied · ${planText(f.decision?.params ?? null, unit) ?? REMEDY_LABEL[f.fix.plan.remedy]} · next session`
              : autonomy === 'off'
                ? `${f.sessions} sessions without progress`
                : `${f.sessions} sessions stuck · ${REMEDY_LABEL[f.fix.plan.remedy]}`;
          return (
            <View key={f.exerciseKey}>
              {i > 0 ? <Separator /> : null}
              <ListRow
                title={f.name}
                subtitle={subtitle}
                accessibilityLabel={`${f.name}, ${subtitle}${pending ? `, suggestion from ${decisionSourceLabel(pending.source)}` : ''}`}
                onPress={() => router.push(progressionHref(f.exerciseKey))}>
                {pending ? (
                  <Badge variant="info">{decisionSourceLabel(pending.source)}</Badge>
                ) : f.status === 'applied' ? (
                  <Badge variant="success">Applied</Badge>
                ) : null}
              </ListRow>
            </View>
          );
        })}
        {loose.map((d, i) => (
          <View key={d.id}>
            {i > 0 || findings.length > 0 ? <Separator /> : null}
            <ListRow
              title={d.exerciseName || 'Suggested change'}
              subtitle={`${REMEDY_LABEL[d.remedy]}${d.params ? ` · ${planText(d.params, unit)}` : ''}`}
              onPress={() => router.push(progressionHref(d.exerciseKey))}>
              <Badge variant="info">{decisionSourceLabel(d.source)}</Badge>
            </ListRow>
          </View>
        ))}
      </Card>
    </Section>
  );
}
