import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Body, Caption } from '@/components/common/text';
import { Skeleton } from '@/components/common/skeleton';
import { Button } from '@/components/ui/button';

/** After this long the user is offered a way out (AI-ARCHITECTURE §3 "Slow"). */
export const AI_SLOW_AFTER_MS = 6000;
const STEP_MS = 1800;

/**
 * Labelled progress instead of a bare spinner: "Looking at your last 4
 * weeks…". Steps advance on a timer and stop at the last one; after 6 s it
 * offers [Keep waiting] [Do it manually].
 */
export function AiThinking({
  steps,
  onManual,
}: {
  steps: readonly string[];
  /** Shown as "Do it manually" once slow; cancels the request upstream. */
  onManual?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [slow, setSlow] = useState(false);
  const [dismissedSlow, setDismissedSlow] = useState(false);

  useEffect(() => {
    const timers = steps.slice(1).map((_, i) => setTimeout(() => setStep(i + 1), STEP_MS * (i + 1)));
    const slowTimer = setTimeout(() => setSlow(true), AI_SLOW_AFTER_MS);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(slowTimer);
    };
  }, [steps]);

  return (
    <View className="gap-3" accessibilityRole="progressbar" accessibilityLabel={steps[step] ?? 'Working'}>
      <Body className="text-muted-foreground">{steps[step] ?? 'Working…'}</Body>
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-2/3" />
      {slow && !dismissedSlow && onManual ? (
        <View className="gap-2">
          <Caption>This is taking longer than usual.</Caption>
          <View className="flex-row gap-2">
            <Button variant="outline" size="sm" className="flex-1" onPress={() => setDismissedSlow(true)}>
              Keep waiting
            </Button>
            <Button variant="tonal" size="sm" className="flex-1" onPress={onManual}>
              Do it manually
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}
