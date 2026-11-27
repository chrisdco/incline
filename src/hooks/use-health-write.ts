import { useEffect } from 'react';
import { AppState } from 'react-native';

import { onTablesChanged } from '@/db/changes';
import { listWorkoutsForHealth } from '@/db/queries/health-write';
import { getHealthPort } from '@/health';
import { syncWorkoutsToHealth } from '@/health/write-workouts';
import { useSettings } from '@/store/settings-store';

/** A finish or a sync pull writes many rows; one pass after the burst. */
const DEBOUNCE_MS = 2000;

let running = false;

/** Module-level so React Compiler never sees the try/finally. */
async function runPass(): Promise<void> {
  const s = useSettings.getState();
  if (!s.healthConnectEnabled || !s.healthWriteWorkouts || running) return;
  running = true;
  try {
    await syncWorkoutsToHealth({
      port: getHealthPort(),
      list: listWorkoutsForHealth,
      cursor: s.healthWriteCursor,
      floor: s.healthWriteFloor,
      setCursor: (n) => useSettings.getState().setHealthWriteCursor(n),
    });
  } catch (err) {
    console.warn('[health] workout write failed; retrying on the next change', err);
  } finally {
    running = false;
  }
}

/**
 * "Save workouts to Health Connect": a pass on mount, on foreground, and
 * after workout_logs changes (finish, edit, delete, sync pull). Write sites
 * never call it; the cursor makes every pass cheap when nothing changed.
 */
export function useHealthWrite(): void {
  const enabled = useSettings((s) => s.healthConnectEnabled && s.healthWriteWorkouts);
  useEffect(() => {
    if (!enabled) return;
    void runPass();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onTablesChanged((tables) => {
      if (!tables.has('workout_logs')) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void runPass();
      }, DEBOUNCE_MS);
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void runPass();
    });
    return () => {
      off();
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);
}
