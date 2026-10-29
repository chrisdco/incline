import { View } from 'react-native';

import { Body, Caption, Text } from '@/components/common/text';
import { ListRow, SectionLabel } from '@/components/layout';
import { Sheet } from '@/components/ui/sheet';
import { formatWeight } from '@/db/calc';
import { describeSets, RULE_LABEL, type CoachingReason } from '@/coaching/reason';

/**
 * "Why this weight?" — compact explanation of a load suggestion.
 * Sentence first, then the inputs the rule saw, then the rule name.
 * Read-only: the numbers come from `suggestNextLoad`, this only shows them.
 */
export function ReasonSheet({
  reason,
  open,
  onOpenChange,
}: {
  reason: CoachingReason;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const i = reason.inputs;
  const out = reason.output;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Why this weight?">
      <View className="gap-4 pb-4">
        <Body>{reason.sentence}</Body>
        {reason.signals.map((s) => (
          <Caption key={s.rule}>{s.sentence}</Caption>
        ))}
        {i ? (
          <View>
            <SectionLabel>Inputs</SectionLabel>
            <ListRow title="Last session" subtitle={lastSubtitle(reason)}>
              <Text className="text-sm tabular-nums text-muted-foreground">
                {describeSets(i.lastSets, i.unit)}
              </Text>
            </ListRow>
            <ListRow title="Target">
              <Text className="text-sm tabular-nums text-muted-foreground">
                {i.targetSets} × {i.targetRepsMin}–{i.targetRepsMax}
              </Text>
            </ListRow>
            <ListRow title="Sessions at top of range">
              <Text className="text-sm tabular-nums text-muted-foreground">{i.sessionsAtTarget}</Text>
            </ListRow>
            <ListRow title="Increment" subtitle={i.unitSource === 'exercise' ? 'Plate step, this exercise’s unit' : 'Plate step'}>
              <Text className="text-sm tabular-nums text-muted-foreground">
                {i.increment} {i.unit === 'metric' ? 'kg' : 'lb'}
              </Text>
            </ListRow>
            {i.lastSetRpe != null ? (
              <ListRow title="Last set RPE">
                <Text className="text-sm tabular-nums text-muted-foreground">{i.lastSetRpe}</Text>
              </ListRow>
            ) : null}
            {i.readiness ? (
              <ListRow title="Today’s check-in">
                <Text className="text-sm text-muted-foreground">{i.readiness}</Text>
              </ListRow>
            ) : null}
            {out.kind === 'load' && out.weight > 0 ? (
              <ListRow title="Suggested">
                <Text className="text-sm font-semibold tabular-nums text-foreground">
                  {formatWeight(out.weight, i.unit)} × {out.reps}
                </Text>
              </ListRow>
            ) : null}
          </View>
        ) : null}
        <Caption>
          Rule: {RULE_LABEL[reason.rule]} · v{reason.ruleVersion}
        </Caption>
      </View>
    </Sheet>
  );
}

function lastSubtitle(reason: CoachingReason): string | undefined {
  const d = reason.inputs?.daysSinceLast;
  if (d == null) return undefined;
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}
