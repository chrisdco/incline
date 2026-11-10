import { View } from 'react-native';
import { Check } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Caption, Text } from '@/components/common/text';
import { StatBlock } from '@/components/layout';
import { Card } from '@/components/ui/card';
import type { PlanDay, PlanProgress } from '@/lib/plan-progress';
import { cn } from '@/lib/cn';

const DAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const STATUS_LABEL: Record<PlanDay['status'], string> = {
  done: 'done',
  missed: 'missed',
  today: 'today',
  upcoming: 'coming up',
};

/**
 * Challenge-style check-ins for the active plan: one row per week, one dot per
 * scheduled day (filled = trained that day). Missed days stay quiet (muted,
 * no red): the point is the next session, not guilt.
 */
export function PlanProgressCard({ progress }: { progress: PlanProgress }) {
  const weeks = Array.from({ length: progress.totalWeeks }, (_, i) => i + 1);
  const pct = progress.scheduled ? Math.round((progress.done / progress.scheduled) * 100) : 0;
  return (
    <Card className="gap-4">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-base font-semibold text-foreground">
          {progress.finished ? 'Plan complete' : `Week ${progress.week} of ${progress.totalWeeks}`}
        </Text>
        <Caption className="tabular-nums">{pct}%</Caption>
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-muted">
        <View className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </View>
      <View className="flex-row">
        <StatBlock label="Done" value={`${progress.done}/${progress.scheduled}`} />
        <StatBlock label="Streak" value={progress.streak} tone={progress.streak > 0 ? 'primary' : 'default'} />
        <StatBlock label="Best" value={progress.bestStreak} />
      </View>
      <View className="gap-2">
        {weeks.map((week) => {
          const days = progress.days.filter((d) => d.week === week);
          return (
            <View key={week} className="flex-row items-center gap-3">
              <Caption className="w-10 tabular-nums">Wk {week}</Caption>
              <View className="flex-1 flex-row flex-wrap gap-2">
                {days.map((d) => (
                  <View
                    key={d.date}
                    accessible
                    accessibilityLabel={`Week ${week} ${new Date(d.date).toLocaleDateString(undefined, { weekday: 'long' })}: ${STATUS_LABEL[d.status]}`}
                    className={cn(
                      'h-7 w-7 items-center justify-center rounded-full',
                      d.status === 'done' && 'bg-primary',
                      d.status === 'missed' && 'bg-muted',
                      d.status === 'today' && 'border-2 border-primary',
                      d.status === 'upcoming' && 'bg-muted/40',
                    )}>
                    {d.status === 'done' ? (
                      <Icon icon={Check} size={14} color="primary-foreground" />
                    ) : (
                      <Text className={cn('text-2xs font-semibold', d.status === 'missed' ? 'text-muted-foreground/60' : 'text-muted-foreground')}>
                        {DAY_LETTER[new Date(d.date).getDay() === 0 ? 6 : new Date(d.date).getDay() - 1]}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </View>
      {progress.extra > 0 ? (
        <Caption>
          +{progress.extra} extra workout{progress.extra === 1 ? '' : 's'} on rest days
        </Caption>
      ) : null}
    </Card>
  );
}
