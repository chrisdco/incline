import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';

import { useSettings } from '@/store/settings-store';

/**
 * Haptics helper that respects the user's haptics setting. Returns stable
 * callbacks so they can be used inline without re-creating handlers.
 */
export function useHaptics() {
  const enabled = useSettings((s) => s.hapticsEnabled);

  const impact = useCallback(
    (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
      if (enabled) Haptics.impactAsync(style).catch(() => {});
    },
    [enabled],
  );

  const notify = useCallback(
    (type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success) => {
      if (enabled) Haptics.notificationAsync(type).catch(() => {});
    },
    [enabled],
  );

  const selection = useCallback(() => {
    if (enabled) Haptics.selectionAsync().catch(() => {});
  }, [enabled]);

  return { impact, notify, selection };
}
