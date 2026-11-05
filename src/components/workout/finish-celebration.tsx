import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Body } from '@/components/common/text';
import { ConfettiBurst } from '@/components/workout/confetti-lottie';
import { getWorkoutCountInRange } from '@/db/queries';
import {
  celebrationKind,
  currentWeekBounds,
  finishCelebrationMessage,
  type CelebrationKind,
} from '@/lib/finish-message';
import { useSettings } from '@/store/settings-store';

function useFinishMoment(active: boolean, prCount: number) {
  const hapticsEnabled = useSettings((s) => s.hapticsEnabled);
  const [message, setMessage] = useState<string | null>(null);
  const [kind, setKind] = useState<CelebrationKind>('normal');
  const [showFx, setShowFx] = useState(false);

  useEffect(() => {
    if (!active) {
      setMessage(null);
      setShowFx(false);
      return;
    }

    let cancelled = false;
    const { startMs, endMs } = currentWeekBounds();
    getWorkoutCountInRange(startMs, endMs)
      .then((weekSessions) => {
        if (cancelled) return;
        const nextKind = celebrationKind({ prCount, weekSessions });
        setKind(nextKind);
        setMessage(finishCelebrationMessage({ prCount, weekSessions }));
        setShowFx(nextKind === 'meaningful');
        if (hapticsEnabled) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      })
      .catch(() => {
        if (cancelled) return;
        setKind('normal');
        setMessage(finishCelebrationMessage({ prCount, weekSessions: 1 }));
        setShowFx(false);
      });

    const hide = setTimeout(() => {
      if (!cancelled) setShowFx(false);
    }, 4200);

    return () => {
      cancelled = true;
      clearTimeout(hide);
    };
  }, [active, prCount, hapticsEnabled]);

  return { message, kind, showFx };
}

/** Full-screen confetti (Modal) — Lottie first, Reanimated backup. */
export function FinishCelebrationOverlay({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <ConfettiBurst />
      </View>
    </Modal>
  );
}

/**
 * Finish moment on summary — message always; overlay only when meaningful.
 */
export function FinishCelebration({
  active,
  prCount,
}: {
  active: boolean;
  prCount: number;
}) {
  const { message, kind, showFx } = useFinishMoment(active, prCount);

  if (!active || !message) return null;

  return (
    <>
      <FinishCelebrationOverlay active={showFx} />
      <Animated.View entering={FadeIn.duration(280)} exiting={FadeOut.duration(200)} className="mb-3">
        <Body className="text-base font-semibold text-primary-text">{message}</Body>
        {kind === 'normal' ? (
          <Body className="mt-0.5 text-sm text-muted-foreground">Nice work — stats below.</Body>
        ) : null}
      </Animated.View>
    </>
  );
}
