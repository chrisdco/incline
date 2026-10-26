import type { ReactNode } from 'react';
import { View } from 'react-native';

import { cn } from '@/lib/cn';
import { Text } from '@/components/common/text';

/** Section heading with an optional trailing action (e.g. "See all"). */
export function SectionHeader({
  title,
  action,
  onAction,
  className,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <View className={cn('flex-row items-center justify-between', className)}>
      <Text className="text-lg font-semibold text-foreground">{title}</Text>
      {action && onAction ? (
        <Text
          accessibilityRole="button"
          className="text-sm font-medium text-primary"
          onPress={onAction}>
          {action}
        </Text>
      ) : null}
    </View>
  );
}

/** Compact label + optional right node for grouping content. */
export function FieldLabel({ label, right }: { label: ReactNode; right?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</Text>
      {right}
    </View>
  );
}
