import { useMemo } from 'react';
import { View } from 'react-native';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import { BrandGradient } from '@/components/brand/brand-gradient';
import type { SceneKind } from '@/ai/ask-brief';
import { hexToRgba, useThemeHex } from '@/lib/theme';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import { motionDuration } from '@/styles/motion';
import { brandTheme } from '@/styles/tokens';

import { HERO_DOTS } from './ai-hero-dots';
import { SCENE_VIEWBOX, hashSeed, sceneDots, weekKey } from './ask-scenes';

/** Height of the ambient layer; it fades out well before the composer. */
const AMBIENT_HEIGHT = 340;

/**
 * Ask's ambient header (ASK-UI.md): the brand gradient and a dither scene
 * bleeding in from the top edge and dissolving into the page. No box. The
 * scene follows the idle headline; the seed changes weekly. Decorative only.
 */
export function AskAmbient({ scene }: { scene: SceneKind }) {
  const scheme = useAppColorScheme();
  const brand = brandTheme(scheme);
  const bg = useThemeHex().background;
  const dots = useMemo(() => sceneDots(scene, hashSeed(`${scene}:${weekKey()}`)), [scene]);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-x-0 top-0"
      style={{ height: AMBIENT_HEIGHT }}>
      <BrandGradient style={{ flex: 1, opacity: scheme === 'dark' ? 0.9 : 0.75 }} />
      <Animated.View
        key={scene}
        entering={FadeIn.duration(motionDuration.enter * 2).easing(Easing.out(Easing.cubic))}
        className="absolute inset-0">
        <Svg width="100%" height="100%" viewBox={SCENE_VIEWBOX} preserveAspectRatio="xMidYMid slice">
          {dots.bands.map((b) => (
            <Path key={b.opacity} d={b.d} fill={brand.ink} opacity={b.opacity} />
          ))}
        </Svg>
      </Animated.View>
      <LinearGradient
        colors={[hexToRgba(bg, 0), hexToRgba(bg, 0.55), bg]}
        locations={[0.1, 0.5, 0.85]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
    </View>
  );
}

/** The AI mark as dots, small; sits in the ambient field above the headline. */
export function AskMark({ size = 44 }: { size?: number }) {
  const ink = brandTheme(useAppColorScheme()).ink;
  return (
    <Animated.View
      entering={FadeIn.duration(motionDuration.enter).easing(Easing.out(Easing.cubic))}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Path d={HERO_DOTS.mark} fill={ink} opacity={0.95} />
      </Svg>
    </Animated.View>
  );
}
