import { View } from 'react-native';
import Animated, { Easing, FadeIn, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { BrandGradient } from '@/components/brand/brand-gradient';
import { Heading } from '@/components/common/text';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import { motionDuration } from '@/styles/motion';
import { brandTheme } from '@/styles/tokens';

import { HERO_DOTS, HERO_DOTS_VIEWBOX } from './ai-hero-dots';

/** The dot mark drifts in from the bottom-right (where the Android AI button sits) and settles. */
function dotsEntering() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateX: 40 }, { translateY: 60 }, { scale: 0.85 }] },
    animations: {
      opacity: withTiming(1, { duration: motionDuration.enter }),
      transform: [
        { translateX: withSpring(0, { damping: 20, stiffness: 160 }) },
        { translateY: withSpring(0, { damping: 20, stiffness: 160 }) },
        { scale: withSpring(1, { damping: 16, stiffness: 160 }) },
      ],
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
