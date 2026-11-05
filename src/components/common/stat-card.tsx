import type { ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/card';
import { Num, splitUnit } from '@/components/layout';
import { Caption, Text } from './text';

/** Compact stat tile used in summaries and the dashboard. */
export function StatCard({
  label,
  value,
  sublabel,
  icon,
  className,
  accent,
}: {
  label: string;
  value: ReactNode;
  sublabel?: string;
  icon?: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <Card className={cn('flex-1 p-3', className)}>
      <View className="flex-row items-center justify-between">
        <Caption>{label}</Caption>
        {icon}
      </View>
      {/* Unit split off and muted so "138.3k kg" stays on one line (SYSTEM.md §3.4). */}
      {typeof value === 'string' ? (
        <Num
          value={splitUnit(value)[0]}
          unit={splitUnit(value)[1]}
          className={cn('mt-2 text-2xl font-bold tracking-tight', accent && 'text-primary-text')}
        />
      ) : (
        <Text className={cn('mt-2 text-2xl font-bold tracking-tight tabular-nums', accent ? 'text-primary-text' : 'text-foreground')}>
          {value}
        </Text>
      )}
      {sublabel ? <Caption className="mt-0.5">{sublabel}</Caption> : null}
    </Card>
  );
}
