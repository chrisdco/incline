import { useEffect } from 'react';
import { AppState } from 'react-native';

import { onTablesChanged } from '@/db/changes';
import { refreshWidgets } from '@/lib/widgets/refresh';
import { useSettings } from '@/store/settings-store';

/** Foreground fires on every unlock; re-posting that often would be rude. */
const FOREGROUND_THROTTLE_MS = 30_000;

/** Tables the widget snapshot reads (active log, weekly count, program, suggestion). */
const WIDGET_TABLES = [
  'workout_logs',
  'workout_templates',
  'template_exercises',
  'programs',
  'program_workouts',
  'kv',
];

/** Trailing debounce: a burst of writes (finish, sync pull) posts once. */
const CHANGE_DEBOUNCE_MS = 1000;

/**
 * Keep the Android widgets in step with the app: on mount, on foreground, when
 * a table the snapshot reads changes (start/finish/discard/delete, sync pull),
 * and when a setting it renders changes (accent, weekly goal). Write sites
 * never call refreshWidgets() themselves; never on a timer.
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
    let changeTimer: ReturnType<typeof setTimeout> | null = null;
    const offTables = onTablesChanged((tables) => {
      if (!WIDGET_TABLES.some((t) => tables.has(t))) return;
      if (changeTimer) clearTimeout(changeTimer);
      changeTimer = setTimeout(() => {
        changeTimer = null;
        run(true);
      }, CHANGE_DEBOUNCE_MS);
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
      offTables();
      if (changeTimer) clearTimeout(changeTimer);
      unsubscribe();
    };
  }, []);
}
