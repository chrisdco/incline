import { forwardRef } from 'react';
import { View } from 'react-native';

import { Body, Caption } from '@/components/common/text';
import { MuscleBodyMap } from '@/components/progress/muscle-body-map';
import { formatDuration } from '@/db/calc';
import { useThemeHex } from '@/lib/theme';
import type { MuscleGroup } from '@/db/types';

/**
 * Compact branded card captured for sharing. Keep typography calm —
 * brand name + workout name + metrics + optional body map.
 */
export const ShareSummaryCard = forwardRef<
  View,
  {
    athleteName: string;
    workoutName: string;
    durationSeconds: number;
    volumeLabel: string;
    completedSets: number;
    prCount: number;
    muscles?: MuscleGroup[];
    backgroundColor?: string;
    handle?: string;
  }
>(function ShareSummaryCard(
  {
    athleteName,
    workoutName,
    durationSeconds,
    volumeLabel,
    completedSets,
    prCount,
    muscles = [],
    backgroundColor,
    handle,
  },
  ref,
) {
  const colors = useThemeHex();

  return (
    <View
      ref={ref}
      collapsable={false}
      className="w-full overflow-hidden rounded-3xl border border-border p-5"
      style={{ backgroundColor: backgroundColor ?? colors.surface1, borderColor: colors.border }}>
      <Caption style={{ color: colors.mutedForeground }}>INCLINE</Caption>
      <Body className="mt-2 text-xl font-bold" style={{ color: colors.foreground }}>
        {workoutName}
      </Body>
      <Caption className="mt-1" style={{ color: colors.mutedForeground }}>
        {handle ?? athleteName}
      </Caption>
      {muscles.length > 0 ? (
        <View className="mt-4 items-center">
          <MuscleBodyMap muscles={muscles} compact scale={0.65} showToggle={false} />
        </View>
      ) : null}
      <View className="mt-5 flex-row justify-between gap-3">
        <View className="flex-1">
          <Caption style={{ color: colors.mutedForeground }}>Time</Caption>
          <Body className="mt-0.5 font-semibold" style={{ color: colors.foreground }}>
            {formatDuration(durationSeconds)}
          </Body>
        </View>
        <View className="flex-1">
          <Caption style={{ color: colors.mutedForeground }}>Volume</Caption>
          <Body className="mt-0.5 font-semibold" style={{ color: colors.foreground }}>
            {volumeLabel}
          </Body>
        </View>
        <View className="flex-1">
          <Caption style={{ color: colors.mutedForeground }}>Sets</Caption>
          <Body className="mt-0.5 font-semibold" style={{ color: colors.foreground }}>
            {completedSets}
          </Body>
        </View>
        {prCount > 0 ? (
          <View className="flex-1">
            <Caption style={{ color: colors.mutedForeground }}>PRs</Caption>
            <Body className="mt-0.5 font-semibold" style={{ color: colors.foreground }}>
              {prCount}
            </Body>
          </View>
        ) : null}
      </View>
      <Caption className="mt-5 text-center" style={{ color: colors.mutedForeground }}>
        Train with me on Incline
      </Caption>
    </View>
  );
});
