import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/common/text';

/** Width of the bright band that sweeps across the label. */
const BAND = 56;
const SWEEP_MS = 1400;

/**
 * "Reading your bench sessions…" with a highlight sweeping across it, while
 * Ask works (Claude/ChatGPT pattern). No mask library: a bright copy of the
 * label sits in a narrow clipped window that slides across, its text
 * counter-shifted so it lines up with the muted copy underneath. Static
 * under reduced motion.
 */
export function ThinkingShimmer({ label }: { label: string }) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(-BAND);

  useEffect(() => {
    if (reduced || !width) return;
    x.value = -BAND;
    x.value = withRepeat(withTiming(width, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => cancelAnimation(x);
  }, [reduced, width, x]);

  const windowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const textStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -x.value }] }));

  return (
    <View accessibilityLiveRegion="polite" accessibilityLabel={label} className="self-start">
      <Text className="text-sm text-muted-foreground" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {label}
      </Text>
      {reduced || !width ? null : (
        <Animated.View pointerEvents="none" className="absolute bottom-0 top-0 overflow-hidden" style={[{ left: 0, width: BAND }, windowStyle]}>
          <Animated.View style={[{ width }, textStyle]}>
            <Text className="text-sm text-foreground" numberOfLines={1}>
              {label}
            </Text>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}
