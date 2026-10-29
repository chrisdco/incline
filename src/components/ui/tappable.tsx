/**
 * Pressable with press-dim feedback that survives NativeWind.
 *
 * NativeWind v4 drops a Pressable's `style` *function* whenever `className`
 * is also set (confirmed on device, #291/#292), so `style={({ pressed }) => …}`
 * never applied: no press feedback, and any layout put there was lost. This
 * tracks the pressed state itself and passes a plain style object, which
 * NativeWind merges with className. Use it instead of a style function; lint
 * rejects `style={({ pressed }) => …}` on className'd Pressables.
 */
import { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

export type TappableProps = Omit<PressableProps, 'style'> & {
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** Opacity while pressed. Default 0.55. */
  pressedOpacity?: number;
};

export function Tappable({ pressedOpacity = 0.55, style, onPressIn, onPressOut, disabled, ...rest }: TappableProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={[style, pressed && !disabled ? { opacity: pressedOpacity } : null]}
      {...rest}
    />
  );
}
