import { View } from 'react-native';

import { Body, Caption } from '@/components/common/text';
import type { MuscleDistribution } from '@/db/types';
import { MUSCLE_LABELS } from '@/lib/labels';
import { useThemeHex } from '@/lib/theme';

export function MuscleSetBars({
  muscles,
  limit = 6,
}: {
  muscles: MuscleDistribution[];
  limit?: number;
}) {
  const colors = useThemeHex();
  const rows = muscles.slice(0, limit);
  const max = Math.max(1, ...rows.map((m) => m.sets));

  if (rows.length === 0) {
    return <Caption>No completed sets this month.</Caption>;
  }

  return (
    <View>
      <View className="mb-3 flex-row justify-between">
        <Caption>Muscle</Caption>
        <Caption>Sets</Caption>
      </View>
      <View className="gap-5">
        {rows.map((m) => (
          <View key={m.muscle} className="gap-1.5">
            <Body className="text-base font-semibold text-foreground">{MUSCLE_LABELS[m.muscle]}</Body>
            <View className="flex-row items-center gap-3">
              <View className="h-5 flex-1 overflow-hidden rounded-full bg-muted">
                <View
                  className="h-5 rounded-full"
                  style={{
                    width: `${Math.round((m.sets / max) * 100)}%`,
                    backgroundColor: colors.primary,
                  }}
                />
              </View>
              <Body className="w-7 text-right text-base font-bold text-foreground">{m.sets}</Body>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
