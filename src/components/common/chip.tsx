import { ScrollView } from 'react-native';
import { Tappable } from '@/components/ui/tappable';

import { cn } from '@/lib/cn';
import { Text } from '@/components/common/text';

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
    <Tappable
      onPress={onPress}
      pressedOpacity={0.55}
      // No android_ripple: on Android it replaces the view's background
      // drawable, which wiped the chip's fill and border (selected state
      // invisible in Settings). Tappable's opacity is the press feedback.
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      className={cn(
        'rounded-full border',
        size === 'sm' ? 'px-2.5 py-1' : 'px-3.5 py-1.5',
        // Neutral inverse for "selected" so it reads on any card fill and
        // with any accent (SYSTEM.md §4: structure stays neutral).
        selected ? 'border-foreground bg-foreground' : 'border-border bg-transparent',
        className,
      )}>
      <Text className={cn('font-medium', size === 'sm' ? 'text-xs' : 'text-sm', selected ? 'text-background' : 'text-foreground-secondary')}>
        {label}
      </Text>
    </Tappable>
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
