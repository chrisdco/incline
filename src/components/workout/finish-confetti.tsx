import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useIconColor } from '@/lib/icon-color';

const PARTICLE_COUNT = 26;

type ParticleSpec = {
  id: number;
  x: number;
  delay: number;
  drift: number;
  spin: number;
  size: number;
  color: string;
  duration: number;
};

/** Short, non-looping confetti burst — Reanimated only (no Lottie dependency). */
export function FinishConfetti({ active }: { active: boolean }) {
  const primary = useIconColor('primary');
  const success = useIconColor('success');
  const warning = useIconColor('warning');
  const info = useIconColor('info');

  const particles = useMemo<ParticleSpec[]>(() => {
    const palette = [primary, success, warning, info, primary];
    return Array.from({ length: PARTICLE_COUNT }, (_, id) => {
      const seed = (id * 47) % 100;
      return {
        id,
        x: 8 + ((id * 37) % 84),
        delay: (id % 8) * 35,
        drift: ((seed % 21) - 10) * 4,
        spin: ((seed % 13) - 6) * 28,
        size: 5 + (seed % 5),
        color: palette[id % palette.length]!,
        duration: 2200 + (seed % 600),
      };
    });
  }, [primary, success, warning, info]);

  if (!active) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} className="z-50 overflow-hidden">
      {particles.map((p) => (
        <ConfettiParticle key={p.id} spec={p} />
      ))}
    </View>
  );
}

function ConfettiParticle({ spec }: { spec: ParticleSpec }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(
      withDelay(
        spec.delay,
        withTiming(1, { duration: spec.duration, easing: Easing.out(Easing.cubic) }),
      ),
    );
  }, [progress, spec.delay, spec.duration]);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85,
      transform: [
        { translateX: spec.drift * t },
        { translateY: -40 + 520 * t * t },
        { rotate: `${spec.spin * t}deg` },
        { scale: 1 - t * 0.25 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: '12%',
          left: `${spec.x}%`,
          width: spec.size,
          height: spec.size * 1.4,
          borderRadius: 2,
          backgroundColor: spec.color,
        },
        style,
      ]}
    />
  );
}
