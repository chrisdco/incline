/**
 * Third-party components that take `style` but not `className`. Uniwind only
 * swaps React Native's own components, so native views from other libraries
 * go through `withUniwind` once here (module scope: wrapping inside a render
 * would recreate the component every time). docs.uniwind.dev/api/with-uniwind
 */
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView as SafeAreaContextView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

/** expo-image with className (rounded-* now applies; NativeWind dropped it, #292). */
export const StyledImage = withUniwind(ExpoImage);

/** react-native-safe-area-context's SafeAreaView with className. */
export const SafeAreaView = withUniwind(SafeAreaContextView);
