import { View } from 'react-native';
import { Sparkles } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Text } from '@/components/common/text';
import { Tappable } from '@/components/ui/tappable';
import { cn } from '@/lib/cn';

/**
 * The three transparency states (AI-ARCHITECTURE §1b), used the same way on
 * every surface:
 * - Suggested: dashed outline + `SuggestedBadge` — nothing has changed yet.
 * - Applied with AI: `AiAssistedTag` on the item; the change is in the AI
 *   activity log with Revert.
 * - Tracked / imported: `SourceChip` naming where the data came from.
 */

export function SuggestedBadge({ className }: { className?: string }) {
  return (
    <View className={cn('flex-row items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5', className)}>
      <Icon icon={Sparkles} size={12} color="primary" />
      <Text className="text-2xs font-semibold text-primary">Suggested</Text>
    </View>
  );
}

export function AiAssistedTag({ className }: { className?: string }) {
  return (
    <View
      className={cn('flex-row items-center gap-1', className)}
      accessibilityLabel="Applied with AI assistance">
      <Icon icon={Sparkles} size={11} color="muted-foreground" />
      <Text className="text-2xs text-muted-foreground">AI-assisted</Text>
    </View>
  );
}

/**
 * "Based on your last 6 bench sessions" / "Health Connect" — the basis of a
 * suggestion or the origin of a tracked row. Tappable when there is data to show.
 */
export function SourceChip({ label, onPress, className }: { label: string; onPress?: () => void; className?: string }) {
  const body = (
    <Text className="text-2xs font-medium text-muted-foreground" numberOfLines={1}>
      {label}
    </Text>
  );
  const classes = cn('self-start rounded-full border border-border/70 px-2 py-0.5', className);
  if (!onPress) return <View className={classes}>{body}</View>;
  return (
    <Tappable onPress={onPress} pressedOpacity={0.55} accessibilityRole="button" className={classes}>
      {body}
    </Tappable>
  );
}
