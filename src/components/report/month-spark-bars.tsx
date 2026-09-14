import { View } from 'react-native';

import { Caption } from '@/components/common/text';
import { useThemeHex } from '@/lib/theme';

export type MonthSparkPoint = {
  key: string;
  label: string;
  value: number;
  active: boolean;
};

/** 12-month spark bars — current month in primary, rest muted. */
export function MonthSparkBars({
  points,
  height = 96,
}: {
  points: MonthSparkPoint[];
  height?: number;
}) {
  const colors = useThemeHex();
  const max = Math.max(1, ...points.map((p) => p.value));
  const barMax = height - 20;

  return (
    <View className="flex-row items-end justify-between gap-1" style={{ height }}>
      {points.map((p) => {
        const h = p.value <= 0 ? 5 : Math.max(12, Math.round((p.value / max) * barMax));
        return (
          <View key={p.key} className="min-w-0 flex-1 items-center justify-end gap-1.5">
            <View
              className="w-full max-w-[20px] rounded-[3px]"
              style={{
                height: h,
                backgroundColor: p.active ? colors.primary : colors.muted,
                opacity: p.value <= 0 && !p.active ? 0.4 : 1,
              }}
            />
            <Caption className="text-[10px] leading-3">{p.label}</Caption>
          </View>
        );
      })}
    </View>
  );
}
