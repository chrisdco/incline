import { View } from 'react-native';

import { hexToRgba } from '@/lib/theme';

/**
 * Static aurora wash behind the home hero (ref screenshots): a top-right orb
 * plus a center wash in the active accent. Plain views, no animation loop —
 * zero ongoing cost. `pointerEvents` off so it never intercepts taps.
 */
export function HeroGlow({ hex }: { hex: string }) {
  return (
    <View pointerEvents="none" className="absolute inset-x-0 top-0" style={{ height: 360 }}>
      <View
        style={{
          position: 'absolute',
          right: -90,
          top: -120,
          width: 290,
          height: 290,
          borderRadius: 145,
          backgroundColor: hexToRgba(hex, 0.2),
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: -80,
          top: 30,
          width: 270,
          height: 270,
          borderRadius: 135,
          backgroundColor: hexToRgba(hex, 0.13),
        }}
      />
    </View>
  );
}
