import { forwardRef } from 'react';
import { View, type ViewInstance } from 'react-native';

import { Body, Caption } from '@/components/common/text';
import { MuscleBodyMap } from '@/components/progress/muscle-body-map';
import { formatDuration } from '@/db/calc';
import { SHARE_BACKGROUNDS, SHARE_TEXT } from '@/lib/share-chrome';
import type { MuscleGroup } from '@/db/types';

/**
 * Compact branded card captured for sharing. Keep typography calm —
 * brand name + workout name + metrics + optional body map.
 */
export const ShareSummaryCard = forwardRef<
  ViewInstance,
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

  return (
    <View
      ref={ref}
      collapsable={false}
      className="w-full overflow-hidden rounded-3xl border border-border p-5"
      style={{ backgroundColor: backgroundColor ?? SHARE_BACKGROUNDS[0].card, borderColor: SHARE_TEXT.border }}>
      <Caption style={{ color: SHARE_TEXT.muted }}>INCLINE</Caption>
      <Body className="mt-2 text-xl font-bold" style={{ color: SHARE_TEXT.foreground }}>
        {workoutName}
      </Body>
      <Caption className="mt-1" style={{ color: SHARE_TEXT.muted }}>
        {handle ?? athleteName}
      </Caption>
      {muscles.length > 0 ? (
        <View className="mt-4 items-center">
          <MuscleBodyMap muscles={muscles} compact scale={0.65} showToggle={false} />
        </View>
      ) : null}
      <View className="mt-5 flex-row justify-between gap-3">
        <View className="flex-1">
          <Caption style={{ color: SHARE_TEXT.muted }}>Time</Caption>
          <Body className="mt-0.5 font-semibold" style={{ color: SHARE_TEXT.foreground }}>
            {formatDuration(durationSeconds)}
          </Body>
        </View>
        <View className="flex-1">
          <Caption style={{ color: SHARE_TEXT.muted }}>Volume</Caption>
          <Body className="mt-0.5 font-semibold" style={{ color: SHARE_TEXT.foreground }}>
            {volumeLabel}
          </Body>
        </View>
        <View className="flex-1">
          <Caption style={{ color: SHARE_TEXT.muted }}>Sets</Caption>
          <Body className="mt-0.5 font-semibold" style={{ color: SHARE_TEXT.foreground }}>
            {completedSets}
          </Body>
        </View>
        {prCount > 0 ? (
          <View className="flex-1">
            <Caption style={{ color: SHARE_TEXT.muted }}>PRs</Caption>
            <Body className="mt-0.5 font-semibold" style={{ color: SHARE_TEXT.foreground }}>
              {prCount}
            </Body>
          </View>
        ) : null}
      </View>
      <Caption className="mt-5 text-center" style={{ color: SHARE_TEXT.muted }}>
        Train with me on Incline
      </Caption>
    </View>
  );
});
