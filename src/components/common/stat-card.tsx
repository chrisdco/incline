import type { ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/card';
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
    <Card className={cn('flex-1 p-3', accent && 'border-primary/40', className)}>
      <View className="flex-row items-center justify-between">
        <Caption>{label}</Caption>
        {icon}
      </View>
      <Text className={cn('mt-2 text-2xl font-bold tracking-tight', accent ? 'text-primary' : 'text-foreground')}>
        {value}
      </Text>
      {sublabel ? <Caption className="mt-0.5">{sublabel}</Caption> : null}
    </Card>
  );
}
