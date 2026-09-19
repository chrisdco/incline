import { useCallback, useRef } from 'react';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

import { useSettings } from '@/store/settings-store';

/**
 * Plays a sound + haptic notification when the rest timer finishes.
 * Falls back to haptics-only if sound playback fails at runtime.
 */
export function useRestTimerSound() {
  const player = useAudioPlayer(require('../../assets/sounds/rest-complete.wav'));
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hapticsEnabled = useSettings((s) => s.hapticsEnabled);

  const play = useCallback(async () => {
    if (hapticsEnabled) {
      try {
        // Haptic triple-burst — completion is Heavy, respected by setting
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        intervalRef.current = setInterval(async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }, 200);
        setTimeout(() => {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }, 600);
      } catch {
        // Silent fail — haptics is enhancement
      }
    }

    // Try playing sound (non-blocking)
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // Sound unavailable — continue with haptics only
    }
  }, [player, hapticsEnabled]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    try {
      player.pause();
    } catch { /* ignore */ }
  }, [player]);

  return { play, stop };
}
