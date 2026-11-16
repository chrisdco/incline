import { View } from 'react-native';

import { Caption } from '@/components/common/text';
import { SectionLabel } from '@/components/layout';
import { Chip } from '@/components/common/chip';
import { READINESS_OPTIONS } from '@/coaching/readiness';
import type { ReadinessLevel } from '@/coaching/types';
import type { HealthSnapshot } from '@/health/readiness';

/**
 * Optional daily check-in. Never blocks starting a workout. With Health
 * Connect on, the readiness rule's read (sleep, HRV, resting HR vs the
 * user's own baseline) shows as a suggestion; the user still picks.
 */
export function ReadinessCheckIn({
  value,
  onChange,
  suggestion,
}: {
  value: ReadinessLevel | null;
  onChange: (level: ReadinessLevel) => void;
  suggestion?: HealthSnapshot['suggestion'];
}) {
  const suggested = suggestion ? READINESS_OPTIONS.find((o) => o.level === suggestion.level) : undefined;
  return (
    <View className="mb-4 rounded-2xl bg-surface1 px-4 py-3">
      <SectionLabel>How do you feel?</SectionLabel>
      {suggestion && suggested ? (
        <Caption className="mb-3" accessibilityLabel={`${suggestion.signals.map((s) => s.text).join(', ')}. Suggests ${suggested.label}.`}>
          {suggestion.signals.map((s) => s.text).join(' · ')} · suggests <Caption className="font-medium text-foreground">{suggested.label}</Caption>
        </Caption>
      ) : (
        <Caption className="mb-3">Optional — tired softens load suggestions today.</Caption>
      )}
      <View className="flex-row flex-wrap gap-2">
        {READINESS_OPTIONS.map((o) => (
          <Chip
            key={o.level}
            size="sm"
            label={o.label}
            selected={value === o.level}
            onPress={() => onChange(o.level)}
          />
        ))}
      </View>
    </View>
  );
}
