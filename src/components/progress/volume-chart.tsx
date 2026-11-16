import { memo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Caption, Text } from '@/components/common/text';
import { cn } from '@/lib/cn';
import { formatDisplayVolume } from '@/db/calc';
import { kgToDisplay } from '@/lib/units';
import type { Unit } from '@/db/types';

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

/**
 * Volume over the selected range as flex bars (plain Views, no chart lib).
 * The caller passes every bucket in the range, empty ones included, so the
 * chart always spans the card instead of a few bars bunched at the left.
 * Tapping a bar selects it; the readout sits above the chart (no floating
 * tooltip). The latest bar is selected by default.
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
  if (data.length === 0) return <Caption>No data yet</Caption>;

  const selected = picked != null && picked < data.length ? picked : data.length - 1;
  const max = Math.max(1, ...data.map((d) => d.value));
  const every = Math.ceil(data.length / MAX_LABELS);
  const sel = data[selected]!;
  const avg = data.reduce((a, d) => a + d.value, 0) / data.length;

  return (
    <View className="gap-3">
      <View className="flex-row items-end justify-between">
        <View>
          <Caption>{sel.detail}</Caption>
          <Text className="text-xl font-semibold text-foreground">{formatDisplayVolume(kgToDisplay(sel.value, unit), unit)}</Text>
        </View>
        <Caption>{sessionsLabel(sel.sessions)}</Caption>
      </View>

      <View style={{ height }} className="flex-row items-end gap-1">
        {/* Average across the range: a quiet reference, not a target. */}
        <View
          pointerEvents="none"
          className="absolute inset-x-0 border-t border-dashed border-border"
          style={{ bottom: (avg / max) * height }}
        />
        {data.map((d, i) => (
          <Pressable
            key={`${d.label}-${i}`}
            onPress={() => setPicked(i)}
            accessibilityRole="button"
            accessibilityLabel={`${d.detail}: ${formatDisplayVolume(kgToDisplay(d.value, unit), unit)}`}
            accessibilityState={{ selected: i === selected }}
            className="h-full flex-1 justify-end"
            style={{ maxWidth: 36 }}>
            <View
              className={cn('w-full rounded-md', barTone(d.value, i === selected))}
              style={{ height: Math.max(3, (d.value / max) * height) }}
            />
          </Pressable>
        ))}
      </View>

      <View className="flex-row gap-1">
        {data.map((d, i) => (
          <View key={`${d.label}-${i}`} className="flex-1 items-center" style={{ maxWidth: 36 }}>
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
  if (value <= 0) return 'bg-muted';
  return selected ? 'bg-primary' : 'bg-primary/45';
}

function sessionsLabel(n: number): string {
  if (n === 0) return 'Rest';
  return `${n} session${n === 1 ? '' : 's'}`;
}
