import { memo, useMemo, useState } from "react";
import {
  type AccessibilityActionEvent,
  LayoutChangeEvent,
  View,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { LineChart } from "react-native-gifted-charts";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { Text } from "@/components/common/text";
import { cn } from "@/lib/cn";
import { useThemeHex } from "@/lib/theme";

import { useChartScrub } from "./use-chart-scrub";

function axisRange(values: number[]): {
  yAxisOffset: number;
  maxValue: number;
} {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, Math.abs(max) * 0.04, 1);
  const clusteredHigh = min > span * 0.4;
  const yAxisOffset = clusteredHigh
    ? Math.max(0, Math.floor(min - span * 0.2))
    : 0;
  const maxValue = Math.max(span * 1.25, (max - yAxisOffset) * 1.15);
  return { yAxisOffset, maxValue: Math.ceil(maxValue) };
}

/** Sparse X labels — first, last, and a few in between (mockup-style). */
function thinLabels(labels: string[]): string[] {
  const n = labels.length;
  if (n <= 2) return labels;
  if (n <= 7) return labels;
  const mid = Math.floor((n - 1) / 2);
  return labels.map((label, i) =>
    i === 0 || i === mid || i === n - 1 ? label : "",
  );
}

/** Readout bubble width (w-28); clamped so it never leaves the chart. */
const BUBBLE_W = 112;
/** Approximate bubble height, for placing it above or below the dot. */
const BUBBLE_H = 44;
/** Gifted Charts pads the plot top by 10 (getExtendedContainerHeightWithPadding). */
const PLOT_TOP_PAD = 10;

/**
 * Gifted Charts area line styled like a product mock: title + date range,
 * soft gradient fill, no grid clutter.
 *
 * Scrubbing (Apple Health / Robinhood pattern): press and drag along the
 * line and a crosshair, dot and floating readout (value + date) follow the
 * nearest point, with a selection haptic per point. Release hides it; a tap
 * pins one point. Our own gesture overlay replaces Gifted's pointer, which
 * only reacted to taps inside a scroll view. Screen readers get an
 * adjustable control that steps through the points.
 */
export const SeriesAreaChart = memo(function SeriesAreaChart({
  points,
  formatValue,
  title,
  subtitle,
  emptyLabel = "Log a few sessions to see your trend.",
  height = 176,
  className,
}: {
  points: { label: string; value: number }[];
  formatValue: (v: number) => string;
  /** When set, renders the mock-style card chrome (title + range). */
  title?: string;
  /** Defaults to first → last point labels. */
  subtitle?: string;
  emptyLabel?: string;
  height?: number;
  className?: string;
}) {
  const colors = useThemeHex();
  const [chartWidth, setChartWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

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
      label: labels[i] ?? "",
    }));
    const rangeLabel =
      subtitle ??
      (points[0] && points[points.length - 1]
        ? `${points[0].label} – ${points[points.length - 1].label}`
        : undefined);
    return { data, yAxisOffset, maxValue, rangeLabel };
  }, [points, subtitle]);

  const yAxisLabelWidth = 36;
  const initialSpacing = 8;
  const endSpacing = 12;
  const count = prepared?.data.length ?? 0;
  const plotWidth = Math.max(chartWidth - yAxisLabelWidth, 0);
  const spacing =
    count > 1 && plotWidth > 0
      ? Math.max(22, (plotWidth - initialSpacing - endSpacing) / (count - 1))
      : 40;
  const firstX = yAxisLabelWidth + initialSpacing;

  // Point heights in overlay coordinates, from Gifted's getY.
  const ys = useMemo(
    () =>
      prepared
        ? points.map(
            (p) =>
              PLOT_TOP_PAD +
              height -
              ((p.value - prepared.yAxisOffset) * height) / prepared.maxValue,
          )
        : [],
    [points, prepared, height],
  );

  const { gesture, index } = useChartScrub({
    count,
    first: firstX,
    step: spacing,
    onSelect: (i) => setSelected(i),
  });

  const crossStyle = useAnimatedStyle(() => {
    const i = index.value;
    return {
      opacity: i < 0 ? 0 : 1,
      transform: [{ translateX: firstX + Math.max(i, 0) * spacing }],
    };
  }, [firstX, spacing]);
  const dotStyle = useAnimatedStyle(() => {
    const i = index.value;
    const y = ys[Math.max(i, 0)] ?? 0;
    return {
      opacity: i < 0 ? 0 : 1,
      transform: [
        { translateX: firstX + Math.max(i, 0) * spacing - 6 },
        { translateY: y - 6 },
      ],
    };
  }, [firstX, spacing, ys]);
  const bubbleStyle = useAnimatedStyle(() => {
    const i = index.value;
    const x = firstX + Math.max(i, 0) * spacing - BUBBLE_W / 2;
    const y = ys[Math.max(i, 0)] ?? 0;
    // Above the dot when there is room, otherwise just below it.
    const top = y > BUBBLE_H + 12 ? y - BUBBLE_H - 12 : y + 12;
    return {
      opacity: i < 0 ? 0 : 1,
      transform: [
        {
          translateX: Math.min(
            Math.max(x, 0),
            Math.max(chartWidth - BUBBLE_W, 0),
          ),
        },
        { translateY: top },
      ],
    };
  }, [firstX, spacing, chartWidth, ys]);

  if (!prepared) {
    return (
      <View className={cn(title && "rounded-2xl bg-surface1 p-4", className)}>
        {title ? (
          <Text className="mb-1 text-lg font-semibold text-foreground">
            {title}
          </Text>
        ) : null}
        <Text className="text-sm text-muted-foreground">{emptyLabel}</Text>
      </View>
    );
  }

  const sel = selected != null ? points[selected] : undefined;
  const last = points[points.length - 1]!;
  const step = (d: 1 | -1) => {
    const next = Math.min(count - 1, Math.max(0, (selected ?? count - 1) + d));
    index.value = next;
    setSelected(next);
  };
  const onA11yAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === "increment") step(1);
    if (e.nativeEvent.actionName === "decrement") step(-1);
  };
  const a11yPoint = sel ?? last;

  const chart = (
    <View
      className="w-full"
      onLayout={onLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={title ? `${title} chart` : "Trend chart"}
      accessibilityHint="Swipe up or down to move between points"
      accessibilityValue={{
        text: `${a11yPoint.label}: ${formatValue(a11yPoint.value)}`,
      }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={onA11yAction}
    >
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
          xAxisLabelTextStyle={{
            fontSize: 10,
            color: colors.mutedForeground,
            width: 52,
          }}
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
          disableScroll
        />
      ) : (
        <View style={{ height }} />
      )}
      {chartWidth > 0 ? (
        <GestureDetector gesture={gesture}>
          <View className="absolute inset-0">
            <Animated.View
              pointerEvents="none"
              className="absolute top-0 w-px bg-primary/30"
              style={[{ height: height + PLOT_TOP_PAD }, crossStyle]}
            />
            <Animated.View
              pointerEvents="none"
              className="absolute left-0 top-0 h-3 w-3 rounded-full border-2 border-card bg-primary"
              style={dotStyle}
            />
            <Animated.View
              pointerEvents="none"
              className="absolute left-0 top-0 w-28 items-center rounded-xl border border-border bg-card px-2 py-1.5 shadow-sm"
              style={bubbleStyle}
            >
              <Text
                className="text-sm font-bold text-foreground"
                numberOfLines={1}
              >
                {sel ? formatValue(sel.value) : ""}
              </Text>
              <Text
                className="text-2xs text-muted-foreground"
                numberOfLines={1}
              >
                {sel?.label ?? ""}
              </Text>
            </Animated.View>
          </View>
        </GestureDetector>
      ) : null}
    </View>
  );

  if (!title) {
    return <View className={className}>{chart}</View>;
  }

  return (
    <View className={cn("rounded-2xl bg-surface1 p-4", className)}>
      <Text className="text-lg font-semibold text-foreground">{title}</Text>
      {prepared.rangeLabel ? (
        <Text className="mt-0.5 text-sm text-muted-foreground">
          {prepared.rangeLabel}
        </Text>
      ) : null}
      <View className="mt-4">{chart}</View>
    </View>
  );
});
