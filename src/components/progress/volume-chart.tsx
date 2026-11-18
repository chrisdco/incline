import { memo, useState } from "react";
import { type AccessibilityActionEvent, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";

import { Caption, Text } from "@/components/common/text";
import { cn } from "@/lib/cn";
import { formatDisplayVolume } from "@/db/calc";
import { kgToDisplay } from "@/lib/units";
import type { Unit } from "@/db/types";

import { useChartScrub } from "./use-chart-scrub";

export interface VolumeBar {
  /** Short axis label (e.g. "Mon", "11/10", "Nov"). */
  label: string;
  /** Readout label for the selected bar (e.g. "Week of Nov 10"). */
  detail: string;
  /** Canonical kg. */
  value: number;
  sessions: number;
}

/** At most this many axis labels; the rest of the bars stay unlabeled. */
const MAX_LABELS = 7;
/** Bar gap (gap-1) and cap (maxWidth), mirrored for the scrub geometry. */
const BAR_GAP = 4;
const BAR_MAX = 36;

/**
 * Volume over the selected range as flex bars (plain Views, no chart lib).
 * The caller passes every bucket in the range, empty ones included, so the
 * chart always spans the card instead of a few bars bunched at the left.
 * Tap a bar, or press and drag across the bars, to select one; the readout
 * above the chart follows the finger (no floating tooltip) with a selection
 * haptic per bar, and the last bar touched stays selected. The latest bar is
 * selected by default. Screen readers step through bars (adjustable).
 *
 * Replaced react-native-gifted-charts here: fixed bar widths left short
 * ranges looking partial, and its press pointer drew an offset label.
 */
export const VolumeChart = memo(function VolumeChart({
  data,
  unit,
  height = 150,
}: {
  data: VolumeBar[];
  unit: Unit;
  height?: number;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const n = data.length;
  const barW =
    n > 0 && width > 0 ? Math.min(BAR_MAX, (width - BAR_GAP * (n - 1)) / n) : 0;
  const { gesture } = useChartScrub({
    count: n,
    first: barW / 2,
    step: barW + BAR_GAP,
    onSelect: (i) => {
      if (i != null) setPicked(i);
    },
  });
  if (n === 0) return <Caption>No data yet</Caption>;

  const selected =
    picked != null && picked < data.length ? picked : data.length - 1;
  const max = Math.max(1, ...data.map((d) => d.value));
  const every = Math.ceil(data.length / MAX_LABELS);
  const sel = data[selected]!;
  const avg = data.reduce((a, d) => a + d.value, 0) / data.length;
  const onA11yAction = (e: AccessibilityActionEvent) => {
    const d =
      e.nativeEvent.actionName === "increment"
        ? 1
        : e.nativeEvent.actionName === "decrement"
          ? -1
          : 0;
    if (d) setPicked(Math.min(n - 1, Math.max(0, selected + d)));
  };

  return (
    <View className="gap-3">
      <View className="flex-row items-end justify-between">
        <View>
          <Caption>{sel.detail}</Caption>
          <Text className="text-xl font-semibold text-foreground">
            {formatDisplayVolume(kgToDisplay(sel.value, unit), unit)}
          </Text>
        </View>
        <Caption>{sessionsLabel(sel.sessions)}</Caption>
      </View>

      <GestureDetector gesture={gesture}>
        <View
          style={{ height }}
          className="flex-row items-end gap-1"
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Volume chart"
          accessibilityHint="Swipe up or down to move between bars"
          accessibilityValue={{
            text: `${sel.detail}: ${formatDisplayVolume(kgToDisplay(sel.value, unit), unit)}`,
          }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={onA11yAction}
        >
          {/* Average across the range: a quiet reference, not a target. */}
          <View
            pointerEvents="none"
            className="absolute inset-x-0 border-t border-dashed border-border"
            style={{ bottom: (avg / max) * height }}
          />
          {data.map((d, i) => (
            <View
              key={`${d.label}-${i}`}
              className="h-full flex-1 justify-end"
              style={{ maxWidth: BAR_MAX }}
            >
              <View
                className={cn(
                  "w-full rounded-md",
                  barTone(d.value, i === selected),
                )}
                style={{ height: Math.max(3, (d.value / max) * height) }}
              />
            </View>
          ))}
        </View>
      </GestureDetector>

      <View className="flex-row gap-1">
        {data.map((d, i) => (
          <View
            key={`${d.label}-${i}`}
            className="flex-1 items-center"
            style={{ maxWidth: 36 }}
          >
            {i % every === (data.length - 1) % every ? (
              <Caption className="text-2xs" numberOfLines={1}>
                {d.label}
              </Caption>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
});

function barTone(value: number, selected: boolean): string {
  if (value <= 0) return "bg-muted";
  return selected ? "bg-primary" : "bg-primary/45";
}

function sessionsLabel(n: number): string {
  if (n === 0) return "Rest";
  return `${n} session${n === 1 ? "" : "s"}`;
}
