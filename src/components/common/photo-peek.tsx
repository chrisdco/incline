import { Modal, Pressable, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';

import { motionDuration } from '@/styles/motion';

/**
 * Instagram-style profile photo peek: long-press an avatar and the photo pops
 * up large and round over a blurred screen. Any tap closes it.
 */
export function PhotoPeek({ uri, open, onClose }: { uri: string | null | undefined; open: boolean; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 64, 320);
  if (!uri) return null;
  return (
    <Modal visible={open} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close photo" style={{ flex: 1 }}>
        <Animated.View
          entering={FadeIn.duration(motionDuration.state)}
          exiting={FadeOut.duration(motionDuration.exit)}
          style={{ flex: 1 }}>
          <BlurView intensity={40} tint="dark" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View
              entering={ZoomIn.springify().damping(18).stiffness(220)}
              exiting={ZoomOut.duration(motionDuration.exit)}>
              <Image
                source={{ uri }}
                contentFit="cover"
                cachePolicy="memory-disk"
                style={{ width: size, height: size, borderRadius: size / 2 }}
              />
            </Animated.View>
          </BlurView>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
