import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { CloudOff } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { aiFailureCopy } from '@/ai/copy';
import type { AiFailure } from '@/ai/types';

/**
 * The one way an AI surface says it couldn't help (AI-ARCHITECTURE §3). Copy
 * comes from `src/ai/copy.ts`; there is always a way on (retry, or the manual
 * path the surface already has).
 */
export function AiFallbackNotice({
  reason,
  onRetry,
  manualLabel,
  onManual,
}: {
  reason: AiFailure;
  onRetry?: () => void;
  manualLabel?: string;
  onManual?: () => void;
}) {
  const router = useRouter();
  if (reason === 'cancelled') return null;
  const copy = aiFailureCopy(reason);
  const canRetry = onRetry && reason !== 'disabled' && reason !== 'consent';
  const review = reason === 'consent' ? () => router.push('/(app)/ai-consent' as Href) : undefined;
  return (
    <View className="gap-3 rounded-2xl bg-muted/60 p-3" accessibilityRole="alert">
      <View className="flex-row items-start gap-2">
        <Icon icon={CloudOff} size={16} color="muted-foreground" />
        <View className="min-w-0 flex-1">
          <Body className="font-medium text-foreground">{copy.title}</Body>
          {copy.body ? <Caption className="mt-0.5">{copy.body}</Caption> : null}
        </View>
      </View>
      {canRetry || onManual || review ? (
        <View className="flex-row gap-2">
          {review ? (
            <Button size="sm" className="flex-1" onPress={review}>
              Choose a provider
            </Button>
          ) : null}
          {canRetry ? (
            <Button variant="outline" size="sm" className="flex-1" onPress={onRetry}>
              Try again
            </Button>
          ) : null}
          {onManual ? (
            <Button variant="tonal" size="sm" className="flex-1" onPress={onManual}>
              {manualLabel ?? 'Do it manually'}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
