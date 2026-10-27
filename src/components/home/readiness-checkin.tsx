import { View } from 'react-native';

import { Caption } from '@/components/common/text';
import { SectionLabel } from '@/components/layout';
import { Chip } from '@/components/common/chip';
import { READINESS_OPTIONS } from '@/coaching/readiness';
import type { ReadinessLevel } from '@/coaching/types';

/** Optional daily check-in. Never blocks starting a workout. */
export function ReadinessCheckIn({
  value,
  onChange,
}: {
  value: ReadinessLevel | null;
  onChange: (level: ReadinessLevel) => void;
}) {
  return (
    <View className="mb-4 rounded-2xl bg-card px-4 py-3">
      <SectionLabel>How do you feel?</SectionLabel>
      <Caption className="mb-3">Optional — tired softens load suggestions today.</Caption>
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
