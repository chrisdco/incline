import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { glassBarInset } from '@/components/layout/glass-tab-bar';
import { SCREEN_CONTENT } from '@/lib/layout';
import { useActiveWorkout } from '@/store/active-workout-store';

/**
 * The floating session bar (`ActiveSessionBar`: 56 pt button + py-3 +
 * border + mb-2) sits over the bottom of every tab while a workout is open.
 */
export const SESSION_BAR_HEIGHT = 90;

/**
 * Extra bottom padding a tab needs so its last row clears the floating
 * chrome: the session bar while a workout is open and, on Android, the glass
 * tab bar (iOS's native tab bar insets the content itself).
 */
export function useSessionBarInset(): number {
  const session = useActiveWorkout((s) => s.activeLogId != null) ? SESSION_BAR_HEIGHT : 0;
  const { bottom } = useSafeAreaInsets();
  return session + (Platform.OS === 'android' ? glassBarInset(bottom) : 0);
}

/** `SCREEN_CONTENT` for a tab screen, bar-aware. */
export function useTabScreenContent() {
  const inset = useSessionBarInset();
  return inset ? { ...SCREEN_CONTENT, paddingBottom: SCREEN_CONTENT.paddingBottom + inset } : SCREEN_CONTENT;
}
