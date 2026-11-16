import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { CloudOff } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { aiFailureCopy } from '@/ai/copy';
import type { AiFailure } from '@/ai/types';

/** Where each failure can be fixed, so the notice is never a dead end. */
const FIX: Partial<Record<AiFailure, { label: string; href: Href }>> = {
  disabled: { label: 'Turn on AI', href: '/(app)/ai-consent?enable=1' as Href },
  consent: { label: 'Choose a provider', href: '/(app)/ai-consent' as Href },
  rate_limited: { label: 'Use your own key', href: '/(app)/ai-settings' as Href },
  unavailable: { label: 'AI settings', href: '/(app)/ai-settings' as Href },
};

/**
 * The one way an AI surface says it couldn't help (AI-ARCHITECTURE §3). Copy
 * comes from `src/ai/copy.ts`; there is always a way on (retry, or the manual
 * path the surface already has), plus a direct route to the setting that
 * fixes it (consent, turning AI on, a key or the provider).
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
  const fix = FIX[reason];
  return (
    <View className="gap-3 rounded-2xl bg-muted/60 p-3" accessibilityRole="alert">
      <View className="flex-row items-start gap-2">
        <Icon icon={CloudOff} size={16} color="muted-foreground" />
        <View className="min-w-0 flex-1">
          <Body className="font-medium text-foreground">{copy.title}</Body>
          {copy.body ? <Caption className="mt-0.5">{copy.body}</Caption> : null}
        </View>
      </View>
      {canRetry || onManual || fix ? (
        <View className="flex-row gap-2">
          {fix ? (
            <Button size="sm" className="flex-1" onPress={() => router.push(fix.href)}>
              {fix.label}
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
