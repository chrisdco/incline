import { forwardRef } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/*
 * Incline's AI mark: a speech bubble with a four-point spark inside ("ask, and
 * get something back"). Chosen over the orbit (read as a record button) and
 * lucide Sparkles (generic). 24-unit grid like lucide, so it drops into
 * <Icon icon={AiMark} />. The same paths drive the Ask hero's dot field
 * (`ai-hero-dots.ts`) and the iOS tab template image (assets/images/tab-ai*.png).
 */
export const BUBBLE = 'M20.5 11.5a8.5 8.5 0 0 1-12.4 7.55L3.5 20.5l1.45-4.45A8.5 8.5 0 1 1 20.5 11.5z';
export const SPARK = 'M12 7.6l1.05 2.85 2.85 1.05-2.85 1.05L12 15.4l-1.05-2.85L8.1 11.5l2.85-1.05z';
/** The spark alone, scaled to fill the grid — for tags under ~14pt where the bubble turns to mush. */
const SPARK_SOLO = 'M12 2.5l2.5 6.8 6.8 2.7-6.8 2.7L12 21.5l-2.5-6.8L2.7 12l6.8-2.7z';

type MarkProps = LucideProps & {
  /** Two-stop gradient paint (hero use); otherwise a single `color`. */
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
      <Path d={BUBBLE} stroke={paint} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d={SPARK} fill={paint} />
    </Svg>
  );
});

const Spark = forwardRef<Svg, LucideProps>(function AiSpark({ size = 24, color = 'currentColor', ...rest }, ref) {
  return (
    <Svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" {...rest}>
      <Path d={SPARK_SOLO} fill={String(color)} />
    </Svg>
  );
});

/** Typed as a lucide icon so the shared <Icon> resolves theme colors for it. */
export const AiMark = Mark as unknown as LucideIcon;
export const AiMarkGradient = Mark;
export const AiSpark = Spark as unknown as LucideIcon;
