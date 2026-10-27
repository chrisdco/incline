import { memo } from 'react';
import { View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

import { Text } from '@/components/common/text';
import { cn } from '@/lib/cn';
import { useThemeHex } from '@/lib/theme';
import { formatDisplayVolume } from '@/db/calc';
import { kgToDisplay } from '@/lib/units';
import type { Unit } from '@/db/types';

/** Hevy-style weekly/monthly volume bar chart with tap-to-see-value. */
export const VolumeChart = memo(function VolumeChart({
  data,
  unit,
  height = 170,
  className,
}: {
  data: { label: string; value: number }[];
  unit: Unit;
  height?: number;
  className?: string;
}) {
  const colors = useThemeHex();
  // Values arrive in canonical kg; bars and axis plot the display unit.
  const shown = data.map((d) => ({ ...d, value: kgToDisplay(d.value, unit) }));
  const max = Math.max(1, ...shown.map((d) => d.value));

  if (data.length === 0) {
    return (
      <Text className="text-sm text-muted-foreground">No data yet</Text>
    );
  }

  return (
    <View className={cn('overflow-hidden', className)}>
      <BarChart
        height={height}
        data={shown.map((d) => ({ value: d.value, label: d.label, frontColor: d.value > 0 ? colors.primary : colors.muted }))}
        barWidth={data.length > 12 ? 10 : 22}
        spacing={data.length > 12 ? 8 : 16}
        barBorderRadius={6}
        maxValue={max}
        noOfSections={4}
        isAnimated
        showVerticalLines
        verticalLinesColor={colors.border}
        yAxisTextStyle={{ fontSize: 10, color: colors.mutedForeground }}
        xAxisLabelTextStyle={{ fontSize: 9, color: colors.mutedForeground }}
        yAxisLabelSuffix=""
        yAxisLabelWidth={34}
        rulesType="solid"
        rulesColor={colors.border}
        labelWidth={36}
        focusBarOnPress
        showValuesAsTopLabel={false}
        pointerConfig={{
          pointerStripHeight: height - 20,
          pointerLabelComponent: (items: { value: number }[]) => (
            <View className="-mt-10 items-center rounded-lg bg-foreground px-2 py-1">
              <Text className="text-xs font-semibold text-background">
                {formatDisplayVolume(items[0]?.value ?? 0, unit)}
              </Text>
            </View>
          ),
        }}
      />
    </View>
  );
});
