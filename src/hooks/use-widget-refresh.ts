import { useEffect } from 'react';
import { AppState } from 'react-native';

import { refreshWidgets } from '@/lib/widgets/refresh';
import { useSettings } from '@/store/settings-store';

/** Foreground fires on every unlock; re-posting that often would be rude. */
const FOREGROUND_THROTTLE_MS = 30_000;

/**
 * Keep the Android widgets in step with the app: on mount, on foreground, and
 * when a setting the snapshot renders changes (accent, weekly goal). Widgets
 * refresh at write sites, never on a timer.
 */
export function useWidgetRefresh(): void {
  useEffect(() => {
    let lastRunAt = 0;
    const run = (force = false) => {
      const now = Date.now();
      if (!force && now - lastRunAt < FOREGROUND_THROTTLE_MS) return;
      lastRunAt = now;
      void refreshWidgets(now);
    };

    run(true);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    const unsubscribe = useSettings.subscribe((state, prev) => {
      if (
        state.accentTheme !== prev.accentTheme ||
        state.weeklyWorkoutGoal !== prev.weeklyWorkoutGoal
      ) {
        run(true);
      }
    });

    return () => {
      appState.remove();
      unsubscribe();
    };
  }, []);
}
