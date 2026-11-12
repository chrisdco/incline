import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { Easing, FadeIn, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { BrandGradient } from '@/components/brand/brand-gradient';
import { Body, Heading } from '@/components/common/text';
import { Tappable } from '@/components/ui/tappable';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import { cn } from '@/lib/cn';
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
 * The brand card: the brand gradient with the AI mark drawn as a dot field
 * on the right and the title bottom-left. Reference: the approved mockup
 * (bubble-spark · dot field), dark and light. Brand moments only (Ask doors,
 * What's new art, onboarding), never data. `compact` is the shorter door.
 */
export function AiHero({
  title = 'Ask Incline',
  subtitle,
  compact,
  onPress,
  accessory,
}: {
  title?: string;
  subtitle?: string;
  compact?: boolean;
  onPress?: () => void;
  accessory?: ReactNode;
}) {
  const brand = brandTheme(useAppColorScheme());
  const body = (
    <BrandGradient style={{ flex: 1 }}>
      <Animated.View entering={dotsEntering} pointerEvents="none" className="absolute inset-y-2 left-0 right-3">
        <Svg width="100%" height="100%" viewBox={HERO_DOTS_VIEWBOX} preserveAspectRatio="xMaxYMid meet">
          {HERO_DOTS.halo.map((h) => (
            <Path key={h.opacity} d={h.d} fill={brand.ink} opacity={h.opacity} />
          ))}
          <Path d={HERO_DOTS.mark} fill={brand.ink} opacity={0.95} />
        </Svg>
      </Animated.View>
      <View className="absolute bottom-4 left-4 right-24" accessibilityRole="header">
        <Heading style={{ color: brand.ink }}>{title}</Heading>
        {subtitle ? (
          <Body className="mt-0.5" style={{ color: brand.inkMuted }}>
            {subtitle}
          </Body>
        ) : null}
      </View>
      {accessory ? <View className="absolute right-4 top-4">{accessory}</View> : null}
    </BrandGradient>
  );
  return (
    <Animated.View
      entering={FadeIn.duration(motionDuration.enter).easing(Easing.out(Easing.cubic))}
      className={cn('overflow-hidden rounded-3xl', compact ? 'h-32' : 'h-48')}>
      {onPress ? (
        <Tappable onPress={onPress} pressedOpacity={0.85} accessibilityRole="button" accessibilityLabel={title} className="flex-1">
          {body}
        </Tappable>
      ) : (
        body
      )}
    </Animated.View>
  );
}
