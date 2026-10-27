import { memo, useMemo, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { Text } from '@/components/common/text';
import { cn } from '@/lib/cn';
import { hexToRgba, useThemeHex } from '@/lib/theme';

function axisRange(values: number[]): { yAxisOffset: number; maxValue: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, Math.abs(max) * 0.04, 1);
  const clusteredHigh = min > span * 0.4;
  const yAxisOffset = clusteredHigh ? Math.max(0, Math.floor(min - span * 0.2)) : 0;
  const maxValue = Math.max(span * 1.25, (max - yAxisOffset) * 1.15);
  return { yAxisOffset, maxValue: Math.ceil(maxValue) };
}

/** Sparse X labels — first, last, and a few in between (mockup-style). */
function thinLabels(labels: string[]): string[] {
  const n = labels.length;
  if (n <= 2) return labels;
  if (n <= 7) return labels;
  const mid = Math.floor((n - 1) / 2);
  return labels.map((label, i) => (i === 0 || i === mid || i === n - 1 ? label : ''));
}

/**
 * Gifted Charts area line styled like a product mock: title + date range,
 * soft gradient fill, no grid clutter, floating light tooltip on press.
 */
export const SeriesAreaChart = memo(function SeriesAreaChart({
  points,
  formatValue,
  title,
  subtitle,
  valueHint,
  emptyLabel = 'Log a few sessions to see your trend.',
  height = 176,
  className,
}: {
  points: { label: string; value: number }[];
  formatValue: (v: number) => string;
  /** When set, renders the mock-style card chrome (title + range). */
  title?: string;
  /** Defaults to first → last point labels. */
  subtitle?: string;
  /** Secondary line in the tooltip (e.g. "kg", "volume"). */
  valueHint?: string;
  emptyLabel?: string;
  height?: number;
  className?: string;
}) {
  const colors = useThemeHex();
  const [chartWidth, setChartWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== chartWidth) setChartWidth(w);
  };

  const prepared = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const { yAxisOffset, maxValue } = axisRange(values);
    const labels = thinLabels(points.map((p) => p.label));
    const data = points.map((p, i) => ({
      value: p.value,
      label: labels[i] ?? '',
    }));
    const rangeLabel =
      subtitle ??
      (points[0] && points[points.length - 1]
        ? `${points[0].label} – ${points[points.length - 1].label}`
        : undefined);
    return { data, yAxisOffset, maxValue, rangeLabel };
  }, [points, subtitle]);

  if (!prepared) {
    return (
      <View className={cn(title && 'rounded-3xl border border-border/60 bg-card p-4', className)}>
        {title ? <Text className="mb-1 text-lg font-semibold text-foreground">{title}</Text> : null}
        <Text className="text-sm text-muted-foreground">{emptyLabel}</Text>
      </View>
    );
  }

  const yAxisLabelWidth = 36;
  const initialSpacing = 8;
  const endSpacing = 12;
  const plotWidth = Math.max(chartWidth - yAxisLabelWidth, 0);
  const spacing =
    prepared.data.length > 1 && plotWidth > 0
      ? Math.max(22, (plotWidth - initialSpacing - endSpacing) / (prepared.data.length - 1))
      : 40;

  const chart = (
    <View className="w-full" onLayout={onLayout}>
      {chartWidth > 0 ? (
        <LineChart
          data={prepared.data}
          height={height}
          width={chartWidth}
          spacing={spacing}
          initialSpacing={initialSpacing}
          endSpacing={endSpacing}
          thickness={2}
          color={colors.primary}
          hideDataPoints
          areaChart
          curved
          // Color stays opaque; Gifted Charts applies transparency via *Opacity.
          // Baking alpha into startFillColor + opacity:1 paints a solid block.
          startFillColor={colors.primary}
          endFillColor={colors.primary}
          startOpacity={0.22}
          endOpacity={0.02}
          yAxisOffset={prepared.yAxisOffset}
          maxValue={prepared.maxValue}
          noOfSections={3}
          yAxisTextStyle={{ fontSize: 11, color: colors.mutedForeground }}
          xAxisLabelTextStyle={{ fontSize: 10, color: colors.mutedForeground, width: 52 }}
          yAxisLabelWidth={yAxisLabelWidth}
          xAxisLabelsHeight={20}
          yAxisThickness={0}
          xAxisThickness={0}
          yAxisColor="transparent"
          xAxisColor="transparent"
          hideRules
          rulesColor="transparent"
          backgroundColor="transparent"
          isAnimated
          animationDuration={800}
          pointerConfig={{
            pointerStripHeight: height - 20,
            pointerStripWidth: 1,
            pointerStripColor: hexToRgba(colors.primary, 0.25),
            pointerColor: colors.primary,
            radius: 6,
            pointerLabelWidth: 110,
            pointerLabelHeight: 44,
            activatePointersOnLongPress: false,
            autoAdjustPointerLabelPosition: true,
            shiftPointerLabelY: -8,
            pointerLabelComponent: (items: { value: number }[]) => (
              <View
                className="min-w-[88px] items-center rounded-xl border border-border bg-card px-3 py-2 shadow-sm"
                style={{ backgroundColor: colors.card }}>
                <Text className="text-sm font-bold text-foreground">
                  {formatValue(items[0]?.value ?? 0)}
                </Text>
                {valueHint ? (
                  <Text className="mt-0.5 text-2xs text-muted-foreground">{valueHint}</Text>
                ) : null}
              </View>
            ),
          }}
        />
      ) : (
        <View style={{ height }} />
      )}
    </View>
  );

  if (!title) {
    return <View className={className}>{chart}</View>;
  }

  return (
    <View className={cn('rounded-3xl border border-border/60 bg-card p-4 shadow-sm', className)}>
      <Text className="text-lg font-semibold text-foreground">{title}</Text>
      {prepared.rangeLabel ? (
        <Text className="mt-0.5 text-sm text-muted-foreground">{prepared.rangeLabel}</Text>
      ) : null}
      <View className="mt-4">{chart}</View>
    </View>
  );
});
