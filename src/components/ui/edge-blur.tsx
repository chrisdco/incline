import { useRef, type ComponentRef, type RefObject } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { hexToRgba, useThemeHex } from '@/lib/theme';
import { useAppColorScheme } from '@/lib/use-color-scheme';

/**
 * Blur bands measured from the edge, stacked so blur builds toward it. The
 * longest stops short of the inner end so its edge sits inside the fade.
 */
const BANDS = [
  { size: 0.85, intensity: 30 },
  { size: 0.6, intensity: 24 },
  { size: 0.35, intensity: 18 },
] as const;
/** Fraction of the height the veil holds at full strength before it fades out. */
const HOLD = 0.6;

/** What a BlurView samples on Android: a ref to the `BlurTargetView` around the content. */
export type BlurTarget = RefObject<ComponentRef<typeof View> | null>;
export const useBlurTarget = () => useRef<ComponentRef<typeof View>>(null);

/** Android blur: RenderNode on 12+, a plain veil below (expo-blur docs, SDK 58). */
export const BLUR_METHOD = 'dimezisBlurViewSdk31Plus' as const;

export function blurTint(scheme: 'light' | 'dark') {
  return scheme === 'dark' ? ('dark' as const) : ('light' as const);
}

/**
 * Content dissolving under a top bar or a floating composer, instead of a
 * hard cut: stacked blur bands that get stronger toward the edge, plus a
 * fade to the page colour. No mask library needed.
 *
 * Android blurs only what's inside `target` (a `BlurTargetView` wrapping the
 * scroll content); iOS blurs whatever is underneath. Decorative: ignores touches.
 */
export function EdgeBlur({
  edge,
  height,
  target,
  veil = 0.85,
  style,
}: {
  edge: 'top' | 'bottom';
  height: number;
  target: BlurTarget;
  /** Strength of the fade to the page colour at the edge (0 = blur only). */
  veil?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const scheme = useAppColorScheme();
  const bg = useThemeHex().background;
  const top = edge === 'top';
  // Solid across the bar (where icons and the composer sit), fading only in the tail.
  const fade = top
    ? ([hexToRgba(bg, veil), hexToRgba(bg, veil), hexToRgba(bg, 0)] as const)
    : ([hexToRgba(bg, 0), hexToRgba(bg, veil), hexToRgba(bg, veil)] as const);
  const stops = top ? ([0, HOLD, 1] as const) : ([0, 1 - HOLD, 1] as const);
  return (
    <View pointerEvents="none" style={[styles.wrap, top ? { top: 0 } : { bottom: 0 }, { height }, style]}>
      {BANDS.map((b) => (
        <BlurView
          key={b.size}
          intensity={b.intensity}
          tint={blurTint(scheme)}
          blurTarget={target}
          blurMethod={BLUR_METHOD}
          style={[styles.band, top ? { top: 0 } : { bottom: 0 }, { height: height * b.size, opacity: Platform.OS === 'ios' ? 0.6 : 0.5 }]}
        />
      ))}
      <LinearGradient colors={fade} locations={stops} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  band: { position: 'absolute', left: 0, right: 0 },
});
