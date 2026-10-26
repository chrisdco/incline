import type { ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from '@/lib/cn';
import { Caption, Text } from '@/components/common/text';

/** Labeled metric used in the workout summary. */
export function SummaryStat({
  label,
  value,
  sublabel,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  sublabel?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <View className={cn('flex-1 items-center rounded-xl bg-muted/40 p-3', className)}>
      <View className="mb-2">{icon}</View>
      <Text className="text-xl font-bold tracking-tight text-foreground">{value}</Text>
      <Caption className="mt-0.5 text-center">{label}</Caption>
      {sublabel ? <Caption className="mt-0.5">{sublabel}</Caption> : null}
    </View>
  );
}
