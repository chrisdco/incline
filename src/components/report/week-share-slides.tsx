import { View } from 'react-native';

import { Body, Caption } from '@/components/common/text';
import { MuscleBodyMap } from '@/components/progress/muscle-body-map';
import { formatWeight } from '@/db/calc';
import { useThemeHex } from '@/lib/theme';
import type { MuscleGroup, PR, Unit } from '@/db/types';

type SlideShellProps = {
  children: React.ReactNode;
};

function SlideShell({
  children,
  backgroundColor,
}: SlideShellProps & { backgroundColor?: string }) {
  const colors = useThemeHex();
  return (
    <View
      collapsable={false}
      className="w-full overflow-hidden rounded-3xl border border-border p-5"
      style={{ backgroundColor: backgroundColor ?? colors.surface1, borderColor: colors.border, minHeight: 360 }}>
      {children}
    </View>
  );
}

export function WeekShareCoverSlide({
  athleteName,
  rangeLabel,
  insightLine,
  backgroundColor,
}: {
  athleteName: string;
  rangeLabel: string;
  insightLine: string;
  backgroundColor?: string;
}) {
  const colors = useThemeHex();
  return (
    <SlideShell backgroundColor={backgroundColor}>
      <Caption style={{ color: colors.mutedForeground }}>INCLINE · WEEKLY</Caption>
      <Body className="mt-3 text-2xl font-bold" style={{ color: colors.foreground }}>
        Your week
      </Body>
      <Caption className="mt-1" style={{ color: colors.mutedForeground }}>
        {rangeLabel}
      </Caption>
      <Caption className="mt-1" style={{ color: colors.mutedForeground }}>
        {athleteName}
      </Caption>
      <Body className="mt-8 text-base" style={{ color: colors.foreground }}>
        {insightLine}
      </Body>
      <Caption className="mt-auto pt-10 text-center" style={{ color: colors.mutedForeground }}>
        Train with me on Incline
      </Caption>
    </SlideShell>
  );
}

export function WeekShareStatsSlide({
  sessions,
  volumeLabel,
  sets,
  streak,
  volumeDeltaPct,
  backgroundColor,
}: {
  sessions: number;
  volumeLabel: string;
  sets: number;
  streak: number;
  volumeDeltaPct: number | null;
  backgroundColor?: string;
}) {
  const colors = useThemeHex();
  const delta =
    volumeDeltaPct === null
      ? '—'
      : `${volumeDeltaPct > 0 ? '+' : ''}${volumeDeltaPct}% vs last week`;
  return (
    <SlideShell backgroundColor={backgroundColor}>
      <Caption style={{ color: colors.mutedForeground }}>INCLINE · STATS</Caption>
      <Body className="mt-3 text-xl font-bold" style={{ color: colors.foreground }}>
        Week at a glance
      </Body>
      <View className="mt-6 gap-4">
        {(
          [
            ['Sessions', String(sessions)],
            ['Volume', volumeLabel],
            ['Sets', String(sets)],
            ['Streak', `${streak}w`],
            ['Volume trend', delta],
          ] as const
        ).map(([label, value]) => (
          <View key={label} className="flex-row items-center justify-between">
            <Caption style={{ color: colors.mutedForeground }}>{label}</Caption>
            <Body className="font-semibold" style={{ color: colors.foreground }}>
              {value}
            </Body>
          </View>
        ))}
      </View>
    </SlideShell>
  );
}

export function WeekSharePrsSlide({
  prs,
  unit,
  backgroundColor,
}: {
  prs: PR[];
  unit: Unit;
  backgroundColor?: string;
}) {
  const colors = useThemeHex();
  return (
    <SlideShell backgroundColor={backgroundColor}>
      <Caption style={{ color: colors.mutedForeground }}>INCLINE · PRS</Caption>
      <Body className="mt-3 text-xl font-bold" style={{ color: colors.foreground }}>
        Records this week
      </Body>
      {prs.length === 0 ? (
        <Body className="mt-8" style={{ color: colors.mutedForeground }}>
          No new records this week.
        </Body>
      ) : (
        <View className="mt-6 gap-3">
          {prs.slice(0, 5).map((pr) => (
            <View key={pr.exerciseId} className="flex-row items-center justify-between gap-3">
              <Body className="flex-1 font-medium" style={{ color: colors.foreground }} numberOfLines={1}>
                {pr.exerciseName}
              </Body>
              <Caption style={{ color: colors.mutedForeground }}>
                {formatWeight(pr.maxWeight, unit)} · e1RM {formatWeight(pr.estimated1RM, unit)}
              </Caption>
            </View>
          ))}
        </View>
      )}
    </SlideShell>
  );
}

export function WeekShareMusclesSlide({
  muscles,
  backgroundColor,
}: {
  muscles: MuscleGroup[];
  backgroundColor?: string;
}) {
  const colors = useThemeHex();
  return (
    <SlideShell backgroundColor={backgroundColor}>
      <Caption style={{ color: colors.mutedForeground }}>INCLINE · MUSCLES</Caption>
      <Body className="mt-3 text-xl font-bold" style={{ color: colors.foreground }}>
        What you trained
      </Body>
      {muscles.length === 0 ? (
        <Body className="mt-8" style={{ color: colors.mutedForeground }}>
          No completed sets this week yet.
        </Body>
      ) : (
        <View className="mt-4 items-center">
          <MuscleBodyMap muscles={muscles} compact scale={0.75} showToggle={false} />
        </View>
      )}
    </SlideShell>
  );
}
