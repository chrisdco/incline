import { memo } from 'react';
import { View } from 'react-native';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react-native';

import { cn } from '@/lib/cn';
import { Icon } from '@/components/common/icon';
import { Text } from '@/components/common/text';

/** Trend delta: "↗ +12% vs last period", green/red text by direction. */
export const TrendChip = memo(function TrendChip({
  label,
  delta,
  invert = false,
  className,
}: {
  label: string;
  delta: number;
  /** When true, a positive delta is "bad" (e.g. lower is better). */
  invert?: boolean;
  className?: string;
}) {
  const up = delta > 0;
  const flat = delta === 0;
  const good = invert ? !up : up;
  return (
    // Coloured text + arrow, no pill: deltas annotate data, they don't
    // compete with it (SYSTEM.md §1 semantic).
    <View className={cn('flex-row items-center gap-1', className)}>
      {!flat ? (
        <Icon icon={up ? ArrowUpRight : ArrowDownRight} size={12} color={good ? 'success' : 'destructive'} />
      ) : null}
      <Text
        className={cn(
          'text-xs font-semibold',
          flat ? 'text-muted-foreground' : good ? 'text-success' : 'text-destructive',
        )}>
        {flat ? '—' : `${up ? '+' : ''}${delta}%`}
      </Text>
      <Text className="text-xs text-muted-foreground">{label}</Text>
    </View>
  );
});
