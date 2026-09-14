import { useMemo } from 'react';
import { View } from 'react-native';

import { Caption } from '@/components/common/text';
import { startOfDay, startOfMonth } from '@/db/calc';
import type { WeekStartsOn } from '@/db/types';
import { cn } from '@/lib/cn';

const SUN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const MON = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/** Compact month grid for reports and share cards. Trained days are filled primary. */
export function MonthDayGrid({
  monthStartMs,
  trainedDayMs,
  weekStartsOn = 'monday',
  compact = false,
}: {
  monthStartMs: number;
  trainedDayMs: number[];
  weekStartsOn?: WeekStartsOn;
  compact?: boolean;
}) {
  const trained = useMemo(() => new Set(trainedDayMs.map((ms) => startOfDay(ms))), [trainedDayMs]);
  const cells = useMemo(() => {
    const start = new Date(startOfMonth(monthStartMs));
    const year = start.getFullYear();
    const month = start.getMonth();
    const firstDow = start.getDay();
    const pad = weekStartsOn === 'monday' ? (firstDow + 6) % 7 : firstDow;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: { day: number | null; trained: boolean }[] = [];
    for (let i = 0; i < pad; i++) out.push({ day: null, trained: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const ms = new Date(year, month, d).getTime();
      out.push({ day: d, trained: trained.has(startOfDay(ms)) });
    }
    return out;
  }, [monthStartMs, trained, weekStartsOn]);

  const labels = weekStartsOn === 'monday' ? MON : SUN;
  const size = compact ? 'h-8 w-8' : 'h-10 w-10';

  return (
    <View>
      <View className="mb-1 flex-row">
        {labels.map((l, i) => (
          <View key={`${l}-${i}`} className="flex-1 items-center">
            <Caption className="text-[10px]">{l}</Caption>
          </View>
        ))}
      </View>
      <View className="flex-row flex-wrap">
        {cells.map((c, i) => (
          <View key={i} className="w-[14.28%] items-center py-0.5">
            {c.day == null ? (
              <View className={size} />
            ) : (
              <View
                className={cn(
                  size,
                  'items-center justify-center rounded-full',
                  c.trained ? 'bg-primary' : 'bg-muted/50',
                )}>
                <Caption className={c.trained ? 'text-primary-foreground' : undefined}>{c.day}</Caption>
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}
