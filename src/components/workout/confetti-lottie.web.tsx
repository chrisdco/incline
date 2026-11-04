import { FinishConfetti } from '@/components/workout/finish-confetti';

// lottie-react-native on web needs @lottiefiles/dotlottie-react; one
// celebration isn't worth the dependency, so web uses the Reanimated burst.
export function ConfettiBurst() {
  return <FinishConfetti active />;
}
