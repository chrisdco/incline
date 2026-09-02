import { memo, useMemo } from 'react';
import { View } from 'react-native';
import { RadarChart } from 'react-native-gifted-charts';

import { Caption } from '@/components/common/text';
import { cn } from '@/lib/cn';
import { MUSCLE_RADAR_AXES, sumSetsForMuscles } from '@/lib/muscle-radar-axes';
import { hexToRgba, useThemeHex } from '@/lib/theme';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import type { MuscleDistribution } from '@/db/types';

/** Distinct from brand primary so current vs previous is obvious. */
const PREVIOUS_LIGHT = '#0284c7';
const PREVIOUS_DARK = '#38bdf8';

/** Fixed 6-axis (hexagon) balance radar — zeros for unworked groups. */
export const MuscleRadar = memo(function MuscleRadar({
  current,
  previous,
  className,
  comparePrevious = true,
  chartSize = 280,
  currentLabel = 'This period',
  previousLabel = 'Previous period',
}: {
  current: MuscleDistribution[];
  previous: MuscleDistribution[];
  className?: string;
  comparePrevious?: boolean;
  chartSize?: number;
  currentLabel?: string;
  previousLabel?: string;
}) {
  const colors = useThemeHex();
  const scheme = useAppColorScheme();
  const webStroke = hexToRgba(colors.foreground, scheme === 'dark' ? 0.14 : 0.1);
  const previousColor = scheme === 'dark' ? PREVIOUS_DARK : PREVIOUS_LIGHT;

  const { labels, currentValues, previousValues, maxValue, showPrevious } = useMemo(() => {
    const cur = MUSCLE_RADAR_AXES.map((axis) => sumSetsForMuscles(current, axis.muscles));
    const prev = MUSCLE_RADAR_AXES.map((axis) => sumSetsForMuscles(previous, axis.muscles));
    const showPrev = comparePrevious && previous.some((d) => d.sets > 0);
    const max = Math.max(1, ...cur, ...(showPrev ? prev : []));
    return {
      labels: MUSCLE_RADAR_AXES.map((a) => a.label),
      currentValues: cur,
      previousValues: prev,
      maxValue: max,
      showPrevious: showPrev,
    };
  }, [current, previous, comparePrevious]);

  const hasAny = currentValues.some((v) => v > 0) || previousValues.some((v) => v > 0);
  if (!hasAny) {
    return <Caption className={className}>No training data yet.</Caption>;
  }

  const currentPolygon = {
    stroke: colors.primary,
    strokeWidth: 2,
    fill: hexToRgba(colors.primary, 0.2),
    opacity: 1,
    showGradient: false,
  };

  const previousPolygon = {
    stroke: previousColor,
    strokeWidth: 2,
    fill: hexToRgba(previousColor, 0.12),
    opacity: 1,
    showGradient: false,
  };

  return (
    <View className={cn('items-center gap-3', className)}>
      <RadarChart
        data={showPrevious ? undefined : currentValues}
        dataSet={showPrevious ? [currentValues, previousValues] : undefined}
        labels={labels}
        maxValue={maxValue}
        noOfSections={3}
        chartSize={chartSize}
        chartContainerProps={{ backgroundColor: 'transparent' }}
        labelConfig={{
          fontSize: 11,
          stroke: colors.mutedForeground,
          fontWeight: '500',
        }}
        gridConfig={{
          stroke: webStroke,
          strokeWidth: 1,
          fill: 'none',
          opacity: 1,
          showGradient: false,
        }}
        asterLinesConfig={{
          stroke: webStroke,
          strokeWidth: 1,
        }}
        polygonConfig={showPrevious ? undefined : currentPolygon}
        polygonConfigArray={showPrevious ? [currentPolygon, previousPolygon] : undefined}
        isAnimated={false}
      />
      <View className="flex-row flex-wrap items-center justify-center gap-4">
        <View className="flex-row items-center gap-2">
          <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.primary }} />
          <Caption>{currentLabel}</Caption>
        </View>
        {showPrevious ? (
          <View className="flex-row items-center gap-2">
            <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: previousColor }} />
            <Caption>{previousLabel}</Caption>
          </View>
        ) : null}
      </View>
    </View>
  );
});
