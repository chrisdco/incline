import { View, type ViewProps } from 'react-native';

import { cn } from '@/lib/cn';

/** Base placeholder block. */
export function Skeleton({ className, ...props }: ViewProps) {
  return <View className={cn('rounded-xl bg-muted', className)} {...props} />;
}

/** Skeleton presets that mirror common screen layouts. */
export function CardSkeleton() {
  return (
    <View className="rounded-3xl border border-border/60 bg-card p-5">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="mt-3 h-4 w-1/2" />
      <View className="mt-4 flex-row gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </View>
    </View>
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

export function StatRowSkeleton() {
  return (
    <View className="flex-row gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-20 flex-1 rounded-2xl" />
      ))}
    </View>
  );
}
