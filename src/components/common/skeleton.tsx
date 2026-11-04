import { View, type ViewProps } from 'react-native';

import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/card';

/** Base placeholder block. */
export function Skeleton({ className, ...props }: ViewProps) {
  return <View className={cn('rounded-xl bg-muted', className)} {...props} />;
}

// Presets sit in a real <Card> so fill and border follow the theme the same
// way the loaded content does (light: white + hairline, dark: surface step).

/** Skeleton presets that mirror common screen layouts. */
export function CardSkeleton() {
  return (
    <Card>
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="mt-3 h-4 w-1/2" />
      <View className="mt-4 flex-row gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </View>
    </Card>
  );
}

export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View className="gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </View>
  );
}

/** Mirrors a row of <StatCard>s: label line, then the value. */
export function StatRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View className="flex-row gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="flex-1 p-3">
          <Skeleton className="h-3 w-1/2 rounded-full" />
          <Skeleton className="mt-3 h-6 w-3/4" />
        </Card>
      ))}
    </View>
  );
}
