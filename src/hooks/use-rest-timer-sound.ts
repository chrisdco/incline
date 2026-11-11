import { useCallback, useEffect, useRef } from 'react';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

import { useSettings } from '@/store/settings-store';

/** Heavy taps at 0, 200 and 400 ms: the rest-complete "triple burst". */
const BURST_MS = [200, 400] as const;

/**
 * Plays a sound + haptic notification when the rest timer finishes.
 * Falls back to haptics-only if sound playback fails at runtime.
 *
 * The burst is three scheduled taps, all tracked, so a second `play()`, a
 * `stop()` or unmount cancels whatever is still pending (#204: the old
 * interval could outlive the screen).
 */
export function useRestTimerSound() {
  const player = useAudioPlayer(require('../../assets/sounds/rest-complete.wav'));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hapticsEnabled = useSettings((s) => s.hapticsEnabled);

  const clearBurst = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  }, []);

  useEffect(() => clearBurst, [clearBurst]);

  const play = useCallback(async () => {
    clearBurst();
    if (hapticsEnabled) {
      const tap = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {
          // Haptics is an enhancement; ignore failures.
        });
      };
      tap();
      timers.current = BURST_MS.map((ms) => setTimeout(tap, ms));
    }

    // Try playing sound (non-blocking)
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // Sound unavailable — continue with haptics only
    }
  }, [player, hapticsEnabled, clearBurst]);

  const stop = useCallback(() => {
    clearBurst();
    try {
      player.pause();
    } catch { /* ignore */ }
  }, [player, clearBurst]);

  return { play, stop };
}
