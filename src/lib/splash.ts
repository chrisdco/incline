import * as SplashScreen from 'expo-splash-screen';

/**
 * One hand-off from the native splash to the first real screen (WORK-QUEUE
 * Build 3, "JS loading hand-off"). The root layout keeps the splash up past
 * DB open; whoever shows the first meaningful screen releases it: Home once
 * its first queries settle, the boot gate when it routes to sign-in,
 * onboarding or a blocking screen. A safety timer means a missed release
 * can only cost a short wait, never a frozen splash.
 */
let released = false;
let safety: ReturnType<typeof setTimeout> | null = null;

export function releaseSplash(): void {
  if (released) return;
  released = true;
  if (safety) clearTimeout(safety);
  void SplashScreen.hideAsync().catch(() => {});
}

/** Longest the splash may outlive DB open. */
export const SPLASH_SAFETY_MS = 2500;

export function armSplashSafety(ms = SPLASH_SAFETY_MS): void {
  if (released || safety) return;
  safety = setTimeout(releaseSplash, ms);
}
