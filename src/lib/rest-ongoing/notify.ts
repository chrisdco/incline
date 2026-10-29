/**
 * Ongoing rest notification — non-Android platforms: no-op.
 *
 * Android uses `notify.android.ts` (expo-widgets custom notification). Keeping
 * this stub separate keeps `@expo/ui/jetpack-compose` out of iOS/web bundles.
 *
 * TODO(#282): iOS Live Activity equivalent (expo-widgets `createLiveActivity`).
 */
import type { RestOngoingInput } from './build';

export async function showRestOngoing(_input: Omit<RestOngoingInput, 'formatTime'>): Promise<void> {}

export async function hideRestOngoing(): Promise<void> {}

export async function readRestOngoingDeadline(_sessionId: number): Promise<number | null> {
  return null;
}

export function subscribeRestOngoingActions(_handlers: {
  onSkip: () => void;
  onAdd: (seconds: number) => void;
}): () => void {
  return () => {};
}
