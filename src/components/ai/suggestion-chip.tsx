import { Sparkles } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Text } from '@/components/common/text';
import { Tappable } from '@/components/ui/tappable';
import { cn } from '@/lib/cn';

/**
 * A context suggestion ("No pulling — add a row?"). Rules decide when one
 * shows; the AI only runs once it's tapped. Dashed = suggested, never applied.
 */
export function SuggestionChip({
  label,
  onPress,
  disabled,
  className,
}: {
  label: string;
  onPress: () => void;
  /** Offline / AI off: stays visible but dimmed so the layout doesn't jump. */
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      pressedOpacity={0.55}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      className={cn(
        'flex-row items-center gap-1.5 self-start rounded-xl border border-dashed border-primary/50 px-3 py-1.5',
        disabled && 'opacity-50',
        className,
      )}>
      <Icon icon={Sparkles} size={14} color="primary" />
      <Text className="text-sm font-medium text-foreground">{label}</Text>
    </Tappable>
  );
}
