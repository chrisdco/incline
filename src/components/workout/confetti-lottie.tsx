import { useState } from 'react';
import { StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';

import { FinishConfetti } from '@/components/workout/finish-confetti';

/** Lottie confetti, Reanimated backup if the animation fails to load. */
export function ConfettiBurst() {
  const [useLottie, setUseLottie] = useState(true);
  if (!useLottie) return <FinishConfetti active />;
  return (
    <LottieView
      source={require('../../../assets/lottie/confetti.json')}
      autoPlay
      loop={false}
      resizeMode="cover"
      style={StyleSheet.absoluteFill}
      onAnimationFailure={() => setUseLottie(false)}
    />
  );
}
