import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToastInset } from '@/components/ui/toast';

/** Gap between the dock's top edge and the snackbar above it. */
const TOAST_GAP = 12;

/**
 * The session screen's one bottom host (audit A14). Pieces stack in layout
 * order instead of each pinning itself absolutely:
 *
 *   ┌ snackbar (global toast, lifted to sit above the dock) ┐
 *   │ children — rest timer bar, docked                       │
 *   └ keyboard / safe-area bottom                            ┘
 *
 * The dock reports `max(dock height, keyboard height)` to the toast system,
 * so undo/PR snackbars never cover the rest timer or hide under the keyboard.
 * In layout flow, the ScrollView above ends where the dock begins.
 */
export function SessionDock({ children }: { children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [dockHeight, setDockHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Keyboard height is measured from the screen bottom; the dock sits above
  // the safe-area inset, so compare both from the same edge.
  const bottom = Math.max(dockHeight + insets.bottom, keyboardHeight) + TOAST_GAP;
  useEffect(() => {
    useToastInset.setState({ bottom });
  }, [bottom]);
  useEffect(() => () => useToastInset.setState({ bottom: null }), []);

  return (
    <View
      onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}
      pointerEvents="box-none">
      {children}
    </View>
  );
}
