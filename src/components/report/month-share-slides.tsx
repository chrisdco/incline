import { View } from 'react-native';

import { Body, Caption } from '@/components/common/text';
import { MonthDayGrid } from '@/components/report/month-day-grid';
import { MuscleSetBars } from '@/components/report/muscle-set-bars';
import { MuscleRadar } from '@/components/progress/muscle-radar';
import { formatWeight } from '@/db/calc';
import { useThemeHex } from '@/lib/theme';
import type { MuscleDistribution, PR, TopExerciseStat, Unit, WeekStartsOn } from '@/db/types';

type Chrome = { backgroundColor?: string; handle: string };

function SlideShell({ children, chrome }: { children: React.ReactNode; chrome: Chrome }) {
  const colors = useThemeHex();
  return (
    <View
      collapsable={false}
      className="w-full overflow-hidden rounded-3xl border border-border p-5"
      style={{
        backgroundColor: chrome.backgroundColor ?? colors.surface1,
        borderColor: colors.border,
        minHeight: 360,
      }}>
      {children}
      <View className="mt-auto flex-row items-end justify-between pt-8">
        <Caption style={{ color: colors.mutedForeground }}>INCLINE</Caption>
        <Caption style={{ color: colors.mutedForeground }}>{chrome.handle}</Caption>
      </View>
    </View>
  );
}

export function MonthShareCoverSlide({
  athleteName,
  monthLabel,
  insightLine,
  chrome,
}: {
  athleteName: string;
  monthLabel: string;
  insightLine: string;
  chrome: Chrome;
}) {
  const colors = useThemeHex();
  return (
    <SlideShell chrome={chrome}>
      <Caption style={{ color: colors.mutedForeground }}>{monthLabel.toUpperCase()}</Caption>
      <Body className="mt-3 text-2xl font-bold" style={{ color: colors.foreground }}>
        Your month
      </Body>
      <Caption className="mt-1" style={{ color: colors.mutedForeground }}>
        {athleteName}
      </Caption>
      <Body className="mt-8 text-base" style={{ color: colors.foreground }}>
        {insightLine}
      </Body>
    </SlideShell>
  );
}

export function MonthShareStatsSlide({
  sessions,
  volumeLabel,
  durationLabel,
  sets,
  chrome,
}: {
  sessions: number;
  volumeLabel: string;
  durationLabel: string;
  sets: number;
  chrome: Chrome;
}) {
  const colors = useThemeHex();
  return (
    <SlideShell chrome={chrome}>
      <Caption style={{ color: colors.mutedForeground }}>{chrome.handle}</Caption>
      <Body className="mt-1 text-3xl font-extrabold" style={{ color: colors.foreground }}>
        Workouts
      </Body>
      <View className="mt-6 flex-row flex-wrap">
        {(
          [
            ['Workouts', String(sessions)],
            ['Duration', durationLabel],
            ['Volume', volumeLabel],
            ['Sets', String(sets)],
          ] as const
        ).map(([label, value]) => (
          <View key={label} className="mb-5 w-1/2 pr-2">
            <Caption style={{ color: colors.mutedForeground }}>{label}</Caption>
            <Body className="mt-1 text-3xl font-extrabold" style={{ color: colors.foreground }}>
              {value}
            </Body>
          </View>
        ))}
      </View>
    </SlideShell>
  );
}

export function MonthSharePrsSlide({ prs, unit, chrome }: { prs: PR[]; unit: Unit; chrome: Chrome }) {
  const colors = useThemeHex();
  return (
    <SlideShell chrome={chrome}>
      <Caption style={{ color: colors.mutedForeground }}>PERSONAL RECORDS</Caption>
      <Body className="mt-2 text-xl font-bold" style={{ color: colors.foreground }}>
        {prs.length} new PR{prs.length === 1 ? '' : 's'}
      </Body>
      {prs.length === 0 ? (
        <Body className="mt-8" style={{ color: colors.mutedForeground }}>
          No new records this month.
        </Body>
      ) : (
        <View className="mt-6 gap-4">
          {prs.slice(0, 4).map((pr) => (
            <View key={pr.exerciseId}>
              <Body className="font-medium" style={{ color: colors.foreground }} numberOfLines={1}>
                {pr.exerciseName}
              </Body>
              <Caption className="mt-0.5" style={{ color: colors.mutedForeground }}>
                1RM {formatWeight(pr.estimated1RM, unit)} · Vol {formatWeight(pr.bestSetVolume, unit)}
              </Caption>
            </View>
          ))}
        </View>
      )}
    </SlideShell>
  );
}

export function MonthShareDaysSlide({
  monthStartMs,
  trainedDayMs,
  weekStartsOn,
  chrome,
}: {
  monthStartMs: number;
  trainedDayMs: number[];
  weekStartsOn: WeekStartsOn;
  chrome: Chrome;
}) {
  const colors = useThemeHex();
  return (
    <SlideShell chrome={chrome}>
      <Caption style={{ color: colors.mutedForeground }}>WORKOUT DAYS LOG</Caption>
      <Body className="mt-2 text-xl font-bold" style={{ color: colors.foreground }}>
        {trainedDayMs.length} day{trainedDayMs.length === 1 ? '' : 's'} trained
      </Body>
      <View className="mt-4">
        <MonthDayGrid
          monthStartMs={monthStartMs}
          trainedDayMs={trainedDayMs}
          weekStartsOn={weekStartsOn}
          compact
        />
      </View>
    </SlideShell>
  );
}

export function MonthShareRadarSlide({
  current,
  previous,
  currentLabel,
  previousLabel,
  chrome,
}: {
  current: MuscleDistribution[];
  previous: MuscleDistribution[];
  currentLabel: string;
  previousLabel: string;
  chrome: Chrome;
}) {
  return (
    <SlideShell chrome={chrome}>
      <Caption className="text-muted-foreground">MUSCLE DISTRIBUTION</Caption>
      <View className="mt-2 items-center">
        <MuscleRadar
          current={current}
          previous={previous}
          chartSize={220}
          currentLabel={currentLabel}
          previousLabel={previousLabel}
        />
      </View>
    </SlideShell>
  );
}

export function MonthShareGroupsSlide({
  muscles,
  chrome,
}: {
  muscles: MuscleDistribution[];
  chrome: Chrome;
}) {
  const colors = useThemeHex();
  return (
    <SlideShell chrome={chrome}>
      <Caption style={{ color: colors.mutedForeground }}>MAIN MUSCLE GROUPS</Caption>
      <Body className="mt-2 mb-4 text-xl font-bold" style={{ color: colors.foreground }}>
        Sets this month
      </Body>
      <MuscleSetBars muscles={muscles} />
    </SlideShell>
  );
}

export function MonthShareTopSlide({
  exercises,
  unit,
  formatVolumeFn,
  chrome,
}: {
  exercises: TopExerciseStat[];
  unit: Unit;
  formatVolumeFn: (v: number, u: Unit) => string;
  chrome: Chrome;
}) {
  const colors = useThemeHex();
  return (
    <SlideShell chrome={chrome}>
      <Caption style={{ color: colors.mutedForeground }}>TOP EXERCISES</Caption>
      <View className="mt-4 gap-3">
        {exercises.length === 0 ? (
          <Body style={{ color: colors.mutedForeground }}>Nothing logged yet.</Body>
        ) : (
          exercises.map((ex) => (
            <View key={ex.exerciseId} className="flex-row items-center justify-between gap-3">
              <Body className="flex-1 font-medium" style={{ color: colors.foreground }} numberOfLines={1}>
                {ex.exerciseName}
              </Body>
              <Caption style={{ color: colors.mutedForeground }}>
                {ex.sets} sets · {formatVolumeFn(ex.volume, unit)}
              </Caption>
            </View>
          ))
        )}
      </View>
    </SlideShell>
  );
}
