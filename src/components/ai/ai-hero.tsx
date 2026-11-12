import { View } from 'react-native';
import Animated, { Easing, FadeIn, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { BrandGradient } from '@/components/brand/brand-gradient';
import { Heading } from '@/components/common/text';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import { motionDuration } from '@/styles/motion';
import { brandTheme } from '@/styles/tokens';

import { HERO_DOTS, HERO_DOTS_VIEWBOX } from './ai-hero-dots';

/** The dot mark eases in from the bottom-right (toward the Android AI button). No spring: one clean move, no overshoot. */
const SETTLE = { duration: motionDuration.enter, easing: Easing.out(Easing.cubic) };
function dotsEntering() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateX: 16 }, { translateY: 24 }] },
    animations: {
      opacity: withTiming(1, SETTLE),
      transform: [{ translateX: withTiming(0, SETTLE) }, { translateY: withTiming(0, SETTLE) }],
    },
  };
}

/**
 * Ask page header: the brand gradient with the AI mark drawn as a dot field
 * on the right and the title bottom-left. Reference: the approved mockup
 * (bubble-spark · dot field), dark and light.
 */
export function AiHero() {
  const brand = brandTheme(useAppColorScheme());
  return (
    <Animated.View entering={FadeIn.duration(motionDuration.enter).easing(Easing.out(Easing.cubic))} className="h-48 overflow-hidden rounded-3xl">
      <BrandGradient style={{ flex: 1 }}>
        <Animated.View entering={dotsEntering} pointerEvents="none" className="absolute inset-y-2 left-0 right-3">
          <Svg width="100%" height="100%" viewBox={HERO_DOTS_VIEWBOX} preserveAspectRatio="xMaxYMid meet">
            {HERO_DOTS.halo.map((h) => (
              <Path key={h.opacity} d={h.d} fill={brand.ink} opacity={h.opacity} />
            ))}
            <Path d={HERO_DOTS.mark} fill={brand.ink} opacity={0.95} />
          </Svg>
        </Animated.View>
        <View className="absolute bottom-4 left-4" accessibilityRole="header">
          <Heading style={{ color: brand.ink }}>Ask Incline</Heading>
        </View>
      </BrandGradient>
    </Animated.View>
  );
}
