import { memo } from 'react';
import { View } from 'react-native';
import { TrendingUp, TrendingDown } from 'lucide-react-native';

import { cn } from '@/lib/cn';
import { Icon } from '@/components/common/icon';
import { Text } from '@/components/common/text';

/** Trend chip: "↑12% vs last period" in green/red based on direction. */
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
    <View
      className={cn(
        'flex-row items-center gap-1 rounded-full px-2.5 py-1',
        flat ? 'bg-muted' : good ? 'bg-success/10' : 'bg-destructive/10',
        className,
      )}>
      {!flat ? (
        <Icon icon={up ? TrendingUp : TrendingDown} size={12} color={good ? 'success' : 'destructive'} />
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
