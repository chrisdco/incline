/**
 * In-app OTA update checks (expo-updates).
 *
 * Native already checks on cold launch (`checkAutomatically: ON_LOAD`) and
 * applies a download on the *next* launch. This adds the two things users
 * notice: a check when the app returns to the foreground (throttled), and a
 * "Restart to update" prompt once a download is ready, instead of waiting
 * for the user to kill the app.
 *
 * No-ops in Expo Go, dev builds and builds without an update URL
 * (`Updates.isEnabled` is false there and the methods reject).
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

import { useToast } from '@/components/ui/toast';
import { useActiveWorkout } from '@/store/active-workout-store';

const FOREGROUND_CHECK_MS = 60 * 60_000;

let lastCheckAt = 0;
let inFlight: Promise<UpdateCheckOutcome> | null = null;

export type UpdateCheckOutcome = 'disabled' | 'none' | 'ready' | 'error';

export function updatesEnabled(): boolean {
  return Updates.isEnabled && !__DEV__;
}

/** Check + download. Safe to call from anywhere; concurrent calls share one run. */
export function checkForAppUpdate(): Promise<UpdateCheckOutcome> {
  if (!updatesEnabled()) return Promise.resolve('disabled');
  inFlight ??= (async (): Promise<UpdateCheckOutcome> => {
    lastCheckAt = Date.now();
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return 'none';
      const fetched = await Updates.fetchUpdateAsync();
      return fetched.isNew ? 'ready' : 'none';
    } catch {
      return 'error';
    }
  })().then((outcome) => {
    inFlight = null;
    return outcome;
  });
  return inFlight;
}

export function applyAppUpdate(): Promise<void> {
  return Updates.reloadAsync();
}

/** Mounted once at the root: foreground checks + the restart prompt. */
export function UpdateBootstrap() {
  const { toast } = useToast();
  const { isUpdatePending } = Updates.useUpdates();

  useEffect(() => {
    if (!updatesEnabled()) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastCheckAt > FOREGROUND_CHECK_MS) {
        void checkForAppUpdate();
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isUpdatePending) return;
    // Never interrupt a workout; the update applies on the next launch, or
    // from Settings → About once the session is done.
    if (useActiveWorkout.getState().activeLogId != null) return;
    toast({
      title: 'Update ready',
      description: 'Restart Incline to get the latest version.',
      variant: 'info',
      durationMs: null,
      action: { label: 'Restart', onPress: () => void applyAppUpdate() },
    });
  }, [isUpdatePending, toast]);

  return null;
}
