import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { G, Path } from 'react-native-svg';

import { BrandGradient } from '@/components/brand/brand-gradient';
import { hexToRgba, useThemeHex } from '@/lib/theme';
import { useAppColorScheme } from '@/lib/use-color-scheme';

/** The Incline mark (assets/brand/incline-mark.svg), drawn in the text colour. */
export function InclineMark({ size = 48 }: { size?: number }) {
  const ink = useThemeHex().foreground;
  return (
    <View accessibilityRole="image" accessibilityLabel="Incline">
      <Svg width={size} height={size} viewBox="0 0 1024 1024">
        <G fill={ink} transform="translate(512 512) scale(0.68) translate(-558 -686)">
          <Path d="M490 418 L582 489 Q585 492 581 494 L476 528 Q472 529 472 525 L487 421 Q488 416 490 418 Z" />
          <Path d="M594 541 L595 900 Q596 924 652 952 L652 955 L465 955 L465 952 Q522 924 523 900 L524 622 Q523 603 466 588 L465 584 Z" />
        </G>
      </Svg>
    </View>
  );
}

/**
 * The brand gradient bleeding in from the top edge and dissolving into the
 * page, as behind Ask (ASK-UI.md ambient), without the dot scene. Decorative;
 * place first inside a full-screen container.
 */
export function BrandFade({ height = 320 }: { height?: number }) {
  const scheme = useAppColorScheme();
  const bg = useThemeHex().background;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-x-0 top-0"
      style={{ height }}>
      <BrandGradient style={{ flex: 1, opacity: scheme === 'dark' ? 0.9 : 0.75 }} />
      <LinearGradient
        colors={[hexToRgba(bg, 0), hexToRgba(bg, 0.55), bg]}
        locations={[0.1, 0.5, 0.85]}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
      />
    </View>
  );
}
