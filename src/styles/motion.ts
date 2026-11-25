/**
 * Motion tokens — single source for durations, curves, and press physics.
 * (Amber pattern: `src/styles/motion.ts`. Keeps animation values consistent
 * and out of render bodies; worklet callers must import the plain values,
 * never class instances, so gestures can serialize them.)
 *
 * Route through these instead of hardcoding durations. No springs: timing only.
 * Pure opacity fades intentionally skip reduce-motion gating upstream —
 * callers decide via `useReducedMotion` where entrances must be disabled
 * (never attach entrances to recycled list rows).
 */

export const motionDuration = {
  /** Press/ripple feedback. */
  feedback: 120,
  /** Toggles, selection, haptic-paired state flips. */
  state: 180,
  /** Screen/element entrances. */
  enter: 250,
  /** Exits, dismissals, toasts. */
  exit: 200,
} as const;

/** Cubic-bezier curves matching Amber's sheet/out/inOut set. */
export const motionCurve = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.77, 0, 0.175, 1],
  sheet: [0.32, 0.72, 0, 1],
} as const;

/**
 * Press feedback for the shared Button/Card scale. Timing, never springs:
 * no bounce anywhere in the app (user decision 2026-11-25).
 */
export const motionPress = {
  scale: 0.97,
  duration: 120,
} as const;

/** Minimum touch target + retention, mirroring Amber `control` tokens. */
export const motionControl = {
  minHeight: 44,
  pressRetentionOffset: 12,
} as const;
