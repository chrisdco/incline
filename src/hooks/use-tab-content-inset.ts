import { SCREEN_CONTENT } from '@/lib/layout';
import { useActiveWorkout } from '@/store/active-workout-store';

/**
 * The floating session bar (`ActiveSessionBar`: 56 pt button + py-3 +
 * border + mb-2) sits over the bottom of every tab while a workout is open.
 */
export const SESSION_BAR_HEIGHT = 90;

/** Extra bottom padding a tab needs so its last row clears the session bar. */
export function useSessionBarInset(): number {
  return useActiveWorkout((s) => s.activeLogId != null) ? SESSION_BAR_HEIGHT : 0;
}

/** `SCREEN_CONTENT` for a tab screen, bar-aware. */
export function useTabScreenContent() {
  const inset = useSessionBarInset();
  return inset ? { ...SCREEN_CONTENT, paddingBottom: SCREEN_CONTENT.paddingBottom + inset } : SCREEN_CONTENT;
}
