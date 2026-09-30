import { Pressable, ScrollView } from 'react-native';

import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';

export function Chip({
  label,
  selected,
  onPress,
  size = 'md',
  className,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
      android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      className={cn(
        'rounded-full border',
        size === 'sm' ? 'px-2.5 py-1' : 'px-3.5 py-1.5',
        selected ? 'border-border bg-secondary' : 'border-border/70 bg-transparent',
        className,
      )}>
      <Text className={cn('font-medium', size === 'sm' ? 'text-xs' : 'text-sm', selected ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
      </Text>
    </Pressable>
  );
}

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

/** Horizontal, scrollable filter chip row with an "All" option. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  allLabel = 'All',
}: {
  options: FilterOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  allLabel?: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 0 }}>
      <Chip label={allLabel} selected={value === null} onPress={() => onChange(null)} />
      {options.map((o) => (
        <Chip key={o.value} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />
      ))}
    </ScrollView>
  );
}
