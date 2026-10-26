import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, Pressable, ScrollView, View, type ListViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';
import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';

import { Body, Caption, Text } from '@/components/common/text';
import { Sheet } from '@/components/ui/sheet';
import { Chip } from '@/components/common/chip';
import { SegmentedControl } from '@/components/common/segmented-control';
import { getWorkoutDays, getDailyCalendarMetrics, getWeeklyConsistency, type DailyCalendarMetrics } from '@/db/queries';
import type { CalendarHeatMetric, WeekStartsOn } from '@/db/types';
import { cn } from '@/lib/cn';
import {
  computeBestDayStreak,
  computeDayStreak,
  computeMonthFrequency,
  computeYearFrequency,
  formatFrequencyLabel,
} from '@/lib/consistency';
import type { IconColor } from '@/lib/icon-color';
import { SCREEN_CONTENT, SCREEN_HEADER } from '@/lib/layout';
import { METRIC_ICONS } from '@/lib/metric-icons';
import { useSettings } from '@/store/settings-store';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS_SUN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const DAY_LABELS_MON = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const DAY_FULL_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_FULL_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const DAY_CELL_HEIGHT = 56;
const MONTH_TITLE_HEIGHT = 40;
const MONTH_MARGIN = 16;
const BOTTOM_PADDING = 40;
const SPINNER_MIN_FLOOR_MS = 200;
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 10 };

const HEAT_LEGEND_LABEL: Record<Exclude<CalendarHeatMetric, 'presence'>, string> = {
  volume: 'Volume',
  intensity: 'Intensity',
  reps: 'Reps',
};

/** Background classes for heat intensity (relative to global max). Month view only. */
const HEAT_BG = ['', 'bg-primary/15', 'bg-primary/30', 'bg-primary/50', 'bg-primary/70'] as const;

function CalendarStat({
  icon,
  iconColor,
  label,
  accessibilityLabel,
}: {
  icon: (typeof METRIC_ICONS)[keyof typeof METRIC_ICONS];
  iconColor: IconColor;
  label: string;
  accessibilityLabel?: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      className="min-w-0 flex-1 flex-row items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-3">
      <Icon icon={icon} size={16} color={iconColor} />
      <Caption className="flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
        {label}
      </Caption>
    </View>
  );
}

type CalendarMode = 'month' | 'year';

function heatLevel(value: number, maxValue: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || maxValue <= 0) return 0;
  const t = value / maxValue;
  if (t <= 0.25) return 1;
  if (t <= 0.5) return 2;
  if (t <= 0.75) return 3;
  return 4;
}

interface MonthItem {
  year: number;
  month: number;
  height: number;
  offset: number;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Column index (0–6) for the 1st of the month given week-start preference. */
function getFirstColumn(year: number, month: number, weekStartsOn: WeekStartsOn): number {
  const jsDay = new Date(year, month, 1).getDay(); // 0 = Sunday
  return weekStartsOn === 'sunday' ? jsDay : (jsDay + 6) % 7;
}

function monthGridHeight(year: number, month: number, weekStartsOn: WeekStartsOn): number {
  const days = getDaysInMonth(year, month);
  const first = getFirstColumn(year, month, weekStartsOn);
  const rows = Math.ceil((first + days) / 7);
  return MONTH_TITLE_HEIGHT + rows * DAY_CELL_HEIGHT + MONTH_MARGIN;
}

function buildMonths(now: number, today: Date, weekStartsOn: WeekStartsOn): MonthItem[] {
  const list: MonthItem[] = [];
  const start = new Date(now - 5 * 365 * 86400000);
  let y = start.getFullYear();
  let m = start.getMonth();
  let offset = 0;
  while (y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth())) {
    const height = monthGridHeight(y, m, weekStartsOn);
    list.push({ year: y, month: m, height, offset });
    offset += height;
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return list;
}

const MonthGrid = memo(function MonthGrid({
  year,
  month,
  metricsByDate,
  heatMetric,
  maxMetric,
  weekStartsOn,
  onDayPress,
  today,
}: {
  year: number;
  month: number;
  metricsByDate: Record<string, DailyCalendarMetrics>;
  heatMetric: CalendarHeatMetric;
  maxMetric: number;
  weekStartsOn: WeekStartsOn;
  onDayPress: (dayMs: number) => void;
  today: Date;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstColumn(year, month, weekStartsOn);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  return (
    <View className="mb-4">
      <Body className="mb-2 px-1 text-base font-semibold text-foreground">
        {MONTH_NAMES[month]} {year}
      </Body>
      <View>
        {Array.from({ length: Math.ceil(cells.length / 7) }, (_, rowIdx) => {
          const row = cells.slice(rowIdx * 7, rowIdx * 7 + 7);
          return (
            <View key={rowIdx} className="flex-row">
              {row.map((day, colIdx) => {
                if (day === null) {
                  return <View key={`blank-${colIdx}`} style={{ height: DAY_CELL_HEIGHT }} className="flex-1 items-center" />;
                }
                const date = new Date(year, month, day);
                const key = toDateKey(date);
                const isToday = isCurrentMonth && today.getDate() === day;
                const dayMetrics = metricsByDate[key];
                const hasWorkout = (dayMetrics?.sessions ?? 0) > 0;
                const metricValue =
                  heatMetric === 'presence'
                    ? 0
                    : (dayMetrics?.[heatMetric] ?? 0);
                const level =
                  heatMetric === 'presence' ? 0 : heatLevel(metricValue, maxMetric);
                const isFuture = date > today;

                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      if (!isFuture) onDayPress(date.getTime());
                    }}
                    disabled={isFuture}
                    accessibilityRole="button"
                    accessibilityLabel={`${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}${hasWorkout ? ', has workout' : ''}`}
                    accessibilityState={{ disabled: isFuture, selected: isToday }}
                    style={{ height: DAY_CELL_HEIGHT }}
                    className="flex-1 items-center justify-center"
                    android_ripple={{ color: 'rgba(255,255,255,0.08)' }}>
                    <View
                      style={{ width: 32, height: 32, borderRadius: 16, overflow: 'hidden' }}
                      className={cn(
                        'items-center justify-center',
                        isToday && 'bg-primary',
                        !isToday && hasWorkout && heatMetric === 'presence' && 'bg-primary/40',
                        !isToday && hasWorkout && heatMetric !== 'presence' && HEAT_BG[level],
                      )}>
                      <Text
                        className={cn(
                          'text-sm',
                          isToday && 'font-bold text-primary-foreground',
                          !isToday && isFuture && 'text-muted-foreground/40',
                          !isToday && !isFuture && hasWorkout && 'font-semibold text-primary',
                          !isToday && !isFuture && !hasWorkout && 'text-foreground',
                        )}>
                        {day}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
});

/** Compact year-overview month: presence only (no volume tiers) for scanability. */
const MiniMonth = memo(function MiniMonth({
  year,
  month,
  workoutDays,
  trainedDays,
  weekStartsOn,
  today,
  onPress,
}: {
  year: number;
  month: number;
  workoutDays: Set<string>;
  trainedDays: number;
  weekStartsOn: WeekStartsOn;
  today: Date;
  onPress: () => void;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstColumn(year, month, weekStartsOn);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const miniLabels = weekStartsOn === 'monday' ? DAY_LABELS_MON : DAY_LABELS_SUN;

  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  const isFutureMonth =
    year > today.getFullYear() || (year === today.getFullYear() && month > today.getMonth());

  return (
    <Pressable
      onPress={onPress}
      disabled={isFutureMonth}
      accessibilityRole="button"
      accessibilityLabel={`${MONTH_NAMES[month]} ${year}`}
      className={cn(
        'w-[48%] rounded-2xl border border-border/60 bg-card px-2.5 py-2.5',
        isFutureMonth && 'opacity-40',
        isCurrentMonth && 'border-primary/40',
      )}>
      <View className="mb-1.5 flex-row items-baseline justify-between">
        <Caption className={cn('font-semibold', isCurrentMonth ? 'text-primary' : 'text-foreground')}>
          {MONTH_SHORT[month]}
        </Caption>
        {trainedDays > 0 ? (
          <Caption className={isCurrentMonth ? 'text-primary' : 'text-muted-foreground'}>
            {trainedDays}d
          </Caption>
        ) : null}
      </View>
      <View className="mb-0.5 flex-row">
        {miniLabels.map((label, i) => (
          <View key={`${label}-${i}`} className="flex-1 items-center">
            <Text className="text-[8px] text-muted-foreground">{label}</Text>
          </View>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, rowIdx) => {
        const row = cells.slice(rowIdx * 7, rowIdx * 7 + 7);
        return (
          <View key={rowIdx} className="flex-row">
            {row.map((day, colIdx) => {
              if (day == null) {
                return <View key={`b-${colIdx}`} className="flex-1 items-center py-0.5" />;
              }
              const date = new Date(year, month, day);
              const key = toDateKey(date);
              const hasWorkout = workoutDays.has(key);
              const isToday = isCurrentMonth && today.getDate() === day;
              return (
                <View key={key} className="flex-1 items-center py-0.5">
                  <View
                    style={{ width: 8, height: 8, borderRadius: 4 }}
                    className={cn(
                      isToday && 'bg-primary',
                      !isToday && hasWorkout && 'bg-primary/55',
                      !isToday && !hasWorkout && 'bg-transparent',
                    )}
                  />
                </View>
              );
            })}
          </View>
        );
      })}
    </Pressable>
  );
});

export default function CalendarScreen() {
  const router = useRouter();
  const calendarHeatMetric = useSettings((s) => s.calendarHeatMetric);
  const weekStartsOn = useSettings((s) => s.weekStartsOn);
  const weeklyWorkoutGoal = useSettings((s) => s.weeklyWorkoutGoal);
  const today = useMemo(() => new Date(), []);
  const [now] = useState(() => Date.now());
  const [mode, setMode] = useState<CalendarMode>('month');

  const [workoutDaySet, setWorkoutDaySet] = useState<Set<string>>(new Set());
  const [metricsByDate, setMetricsByDate] = useState<Record<string, DailyCalendarMetrics>>({});
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [weekGoalProgress, setWeekGoalProgress] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(today.getFullYear());
  const [yearViewYear, setYearViewYear] = useState(today.getFullYear());

  const [minTimePassed, setMinTimePassed] = useState(false);
  const [calendarReady, setCalendarReady] = useState(false);

  const months = useMemo(() => buildMonths(now, today, weekStartsOn), [now, today, weekStartsOn]);
  const dayHeaders = weekStartsOn === 'monday' ? DAY_FULL_MON : DAY_FULL_SUN;

  const listRef = useRef<FlatList<MonthItem>>(null);
  const viewportHeightRef = useRef(0);
  const didInitScrollRef = useRef(false);
  const [visibleIndex, setVisibleIndex] = useState(months.length - 1);

  const years = useMemo(() => {
    const set = new Set(months.map((m) => m.year));
    return [...set].sort((a, b) => b - a);
  }, [months]);

  const minYear = years[years.length - 1] ?? today.getFullYear();
  const maxYear = years[0] ?? today.getFullYear();

  const maxMetric = useMemo(() => {
    if (calendarHeatMetric === 'presence') return 0;
    let max = 0;
    for (const m of Object.values(metricsByDate)) {
      const v = m[calendarHeatMetric];
      if (v > max) max = v;
    }
    return max;
  }, [metricsByDate, calendarHeatMetric]);

  useEffect(() => {
    const floor = setTimeout(() => setMinTimePassed(true), SPINNER_MIN_FLOOR_MS);
    return () => clearTimeout(floor);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [days, metrics, consistency] = await Promise.all([
          getWorkoutDays(),
          getDailyCalendarMetrics(),
          getWeeklyConsistency(weeklyWorkoutGoal),
        ]);
        setWorkoutDaySet(new Set(days.map((d) => toDateKey(new Date(d)))));
        setMetricsByDate(metrics);
        setStreak(consistency.currentWeeklyStreak);
        setBestStreak(consistency.bestWeeklyStreak);
        setWeekGoalProgress(
          consistency.goal > 0
            ? `${consistency.sessionsThisWeek}/${consistency.goal} this week`
            : null,
        );
      } catch {
        // Leave the calendar usable even if stats fail to load.
      }
    })();
  }, [now, weeklyWorkoutGoal]);

  const handleDayPress = useCallback((dayMs: number) => {
    router.push({ pathname: '/(app)/day/[ms]', params: { ms: String(dayMs) } });
  }, [router]);

  const scrollToIndex = useCallback((index: number, animated: boolean) => {
    if (index < 0 || index >= months.length) return;
    listRef.current?.scrollToIndex({ index, animated, viewPosition: 0 });
  }, [months.length]);

  const tryInitScroll = useCallback(() => {
    if (didInitScrollRef.current) return;
    if (months.length === 0 || viewportHeightRef.current === 0) return;
    didInitScrollRef.current = true;
    requestAnimationFrame(() => scrollToIndex(months.length - 1, false));
  }, [months.length, scrollToIndex]);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    viewportHeightRef.current = e.nativeEvent.layout.height;
    tryInitScroll();
  }, [tryInitScroll]);

  useEffect(() => {
    tryInitScroll();
  }, [tryInitScroll]);

  const goToToday = useCallback(() => {
    if (mode === 'year') {
      setYearViewYear(today.getFullYear());
      return;
    }
    scrollToIndex(months.length - 1, true);
  }, [mode, months.length, scrollToIndex, today]);

  const openMonth = useCallback((year: number, month: number) => {
    const idx = months.findIndex((m) => m.year === year && m.month === month);
    if (idx < 0) return;
    setMode('month');
    setPickerOpen(false);
    requestAnimationFrame(() => scrollToIndex(idx, true));
  }, [months, scrollToIndex]);

  const jumpToMonth = useCallback((year: number, month: number) => {
    openMonth(year, month);
  }, [openMonth]);

  const getItemLayout = useCallback((_: ArrayLike<MonthItem> | null | undefined, index: number) => {
    const item = months[index];
    return {
      length: item?.height ?? monthGridHeight(today.getFullYear(), today.getMonth(), weekStartsOn),
      offset: item?.offset ?? 0,
      index,
    };
  }, [months, today, weekStartsOn]);

  const renderMonth = useCallback(({ item }: { item: MonthItem }) => (
    <View style={{ height: item.height }}>
      <MonthGrid
        year={item.year}
        month={item.month}
        metricsByDate={metricsByDate}
        heatMetric={calendarHeatMetric}
        maxMetric={maxMetric}
        weekStartsOn={weekStartsOn}
        onDayPress={handleDayPress}
        today={today}
      />
    </View>
  ), [metricsByDate, calendarHeatMetric, maxMetric, weekStartsOn, handleDayPress, today]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    if (viewableItems.length === 0) return;
    const first = viewableItems[0];
    if (first.index != null) {
      setVisibleIndex(first.index);
      if (viewableItems.some((v) => v.index === months.length - 1)) {
        setCalendarReady(true);
      }
    }
  }, [months.length]);

  const visible = months[visibleIndex] ?? months[months.length - 1] ?? {
    year: today.getFullYear(),
    month: today.getMonth(),
    height: 0,
    offset: 0,
  };
  const visibleLabel = `${MONTH_NAMES[visible.month]} ${visible.year}`;
  const showSpinner = mode === 'month' && (!minTimePassed || !calendarReady);

  const monthActivity = useMemo(() => {
    const map = new Map<string, number>();
    for (const key of workoutDaySet) {
      const [y, m] = key.split('-');
      const k = `${y}-${Number(m)}`;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [workoutDaySet]);

  const dayStreak = useMemo(() => computeDayStreak(workoutDaySet, now), [workoutDaySet, now]);
  const bestDayStreak = useMemo(() => computeBestDayStreak(workoutDaySet), [workoutDaySet]);
  const yearFreq = useMemo(
    () => computeYearFrequency(metricsByDate, yearViewYear),
    [metricsByDate, yearViewYear],
  );
  const visibleMonthFreq = useMemo(
    () => computeMonthFrequency(metricsByDate, visible.year, visible.month),
    [metricsByDate, visible.year, visible.month],
  );
  const frequencyLabel =
    mode === 'year'
      ? `${yearViewYear} · ${formatFrequencyLabel(yearFreq)}`
      : `${MONTH_SHORT[visible.month]} · ${formatFrequencyLabel(visibleMonthFreq)}`;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className={`${SCREEN_HEADER} gap-3`}>
        <View className="flex-row items-center justify-between">
          {mode === 'month' ? (
            <>
              <View style={{ width: 48 }} />
              <Pressable
                onPress={() => {
                  setPickerYear(visible.year);
                  setPickerOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Choose month and year"
                className="flex-row items-center gap-1">
                <Body className="text-lg font-semibold text-foreground">{visibleLabel}</Body>
                <Icon icon={ChevronDown} size={16} color="muted-foreground" />
              </Pressable>
              <Pressable onPress={goToToday} accessibilityRole="button" accessibilityLabel="Go to today" hitSlop={8}>
                <Caption className="font-medium text-primary">Today</Caption>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                onPress={() => setYearViewYear((y) => Math.max(minYear, y - 1))}
                disabled={yearViewYear <= minYear}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Previous year"
                className={cn(yearViewYear <= minYear && 'opacity-30')}>
                <Icon icon={ChevronLeft} size={22} color="foreground" />
              </Pressable>
              <Body className="text-lg font-semibold text-foreground">{yearViewYear}</Body>
              <Pressable
                onPress={() => setYearViewYear((y) => Math.min(maxYear, y + 1))}
                disabled={yearViewYear >= maxYear}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Next year"
                className={cn(yearViewYear >= maxYear && 'opacity-30')}>
                <Icon icon={ChevronRight} size={22} color="foreground" />
              </Pressable>
            </>
          )}
        </View>
        <SegmentedControl<CalendarMode>
          value={mode}
          onChange={setMode}
          values={[
            { value: 'month', label: 'Month' },
            { value: 'year', label: 'Year' },
          ]}
        />
      </View>

      <View className="mx-4 mt-2 gap-2">
        <View className="flex-row gap-3">
          <CalendarStat
            icon={METRIC_ICONS.streak}
            iconColor="warning"
            label={`${streak}w streak${bestStreak > streak ? ` · best ${bestStreak}w` : ''}`}
          />
          <CalendarStat
            icon={METRIC_ICONS.streak}
            iconColor="warning"
            label={`${dayStreak}d streak${bestDayStreak > dayStreak ? ` · best ${bestDayStreak}d` : ''}`}
          />
        </View>
        <View className="flex-row gap-3">
          {weekGoalProgress ? (
            <CalendarStat icon={METRIC_ICONS.sessions} iconColor="info" label={weekGoalProgress} />
          ) : null}
          <CalendarStat icon={METRIC_ICONS.sessions} iconColor="info" label={frequencyLabel} />
        </View>
      </View>

      {mode === 'month' && calendarHeatMetric !== 'presence' && maxMetric > 0 ? (
        <View className="mx-4 mt-2 flex-row items-center justify-end gap-1.5">
          <Caption className="mr-1 text-xs">{HEAT_LEGEND_LABEL[calendarHeatMetric]}</Caption>
          {[1, 2, 3, 4].map((level) => (
            <View
              key={level}
              className={cn('h-2.5 w-2.5 rounded-sm', HEAT_BG[level as 1 | 2 | 3 | 4])}
            />
          ))}
        </View>
      ) : null}

      {mode === 'month' ? (
        <View className="mx-4 mt-3 flex-row border-b border-border pb-2">
          {dayHeaders.map((label) => (
            <View key={label} className="flex-1 items-center">
              <Caption className="text-xs">{label}</Caption>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ flex: 1, display: mode === 'month' ? 'flex' : 'none' }}>
        <FlatList
          ref={listRef}
          data={months}
          keyExtractor={(m) => `${m.year}-${m.month}`}
          renderItem={renderMonth}
          getItemLayout={getItemLayout}
          initialScrollIndex={Math.max(0, months.length - 1)}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => scrollToIndex(info.index, false), 80);
          }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={VIEWABILITY_CONFIG}
          onLayout={handleLayout}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
          contentContainerStyle={{ paddingHorizontal: SCREEN_CONTENT.paddingHorizontal, paddingBottom: BOTTOM_PADDING }}
        />
      </View>

      <View style={{ flex: 1, display: mode === 'year' ? 'flex' : 'none' }}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: SCREEN_CONTENT.paddingHorizontal,
            paddingTop: 12,
            paddingBottom: BOTTOM_PADDING,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            rowGap: 12,
          }}
          showsVerticalScrollIndicator={false}>
          {MONTH_SHORT.map((_, month) => {
            const available = months.some((m) => m.year === yearViewYear && m.month === month);
            if (!available) {
              return (
                <View
                  key={month}
                  className="w-[48%] rounded-2xl border border-transparent px-2.5 py-2.5 opacity-30">
                  <Caption className="mb-1.5 font-semibold text-muted-foreground">{MONTH_SHORT[month]}</Caption>
                </View>
              );
            }
            return (
              <MiniMonth
                key={`${yearViewYear}-${month}-${weekStartsOn}`}
                year={yearViewYear}
                month={month}
                workoutDays={workoutDaySet}
                trainedDays={yearFreq.trainedDaysByMonth[month] ?? 0}
                weekStartsOn={weekStartsOn}
                today={today}
                onPress={() => openMonth(yearViewYear, month)}
              />
            );
          })}
        </ScrollView>
      </View>

      <Sheet open={pickerOpen} onOpenChange={setPickerOpen} title="Jump to month" mode="expandable" scroll>
        <Caption className="mb-2">Year</Caption>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {years.map((y) => (
            <Chip key={y} label={String(y)} selected={pickerYear === y} onPress={() => setPickerYear(y)} />
          ))}
        </View>
        <Caption className="mb-2">Month</Caption>
        <View className="flex-row flex-wrap gap-2 pb-2">
          {MONTH_SHORT.map((label, month) => {
            const available = months.some((m) => m.year === pickerYear && m.month === month);
            const count = monthActivity.get(`${pickerYear}-${month + 1}`) ?? 0;
            return (
              <Pressable
                key={label}
                disabled={!available}
                onPress={() => jumpToMonth(pickerYear, month)}
                className={cn(
                  'min-w-[22%] flex-1 items-center rounded-2xl border px-2 py-3',
                  available ? 'border-border bg-card' : 'border-transparent opacity-35',
                  visible.year === pickerYear && visible.month === month && 'border-primary bg-primary/10',
                )}>
                <Body className="text-sm font-medium text-foreground">{label}</Body>
                {count > 0 ? (
                  <Caption className="mt-1 text-[10px] font-medium text-primary">{count}d</Caption>
                ) : (
                  <View className="mt-1.5 h-3.5" />
                )}
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      {showSpinner ? (
        <View pointerEvents="auto" className="absolute inset-0 z-50 items-center justify-center bg-background">
          <PrimaryActivityIndicator />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
