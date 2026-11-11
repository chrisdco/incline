import { forwardRef } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/*
 * Incline's AI mark: an orbit (ring with an opening, a moon in the opening, a
 * core). Replaces lucide Sparkles, which reads as generic "AI" clip-art.
 * 24-unit grid like lucide, so it drops into <Icon icon={AiMark} />.
 */
const RING = 'M18.34 9.04 A7 7 0 1 1 14.96 5.66';

type MarkProps = LucideProps & {
  /** Two-stop fill/stroke gradient (hero use); otherwise a single `color`. */
  gradient?: readonly [string, string];
};

const Mark = forwardRef<Svg, MarkProps>(function AiMark(
  { size = 24, color = 'currentColor', strokeWidth = 2, gradient, ...rest },
  ref,
) {
  const paint = gradient ? 'url(#aiMarkGradient)' : String(color);
  return (
    <Svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" {...rest}>
      {gradient ? (
        <Defs>
          <LinearGradient id="aiMarkGradient" x1="4" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={gradient[0]} />
            <Stop offset="1" stopColor={gradient[1]} />
          </LinearGradient>
        </Defs>
      ) : null}
      <Path d={RING} stroke={paint} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={16.95} cy={7.05} r={2} fill={paint} />
      <Circle cx={12} cy={12} r={2.6} fill={paint} />
    </Svg>
  );
});

/** Typed as a lucide icon so the shared <Icon> resolves theme colors for it. */
export const AiMark = Mark as unknown as LucideIcon;
export const AiMarkGradient = Mark;
