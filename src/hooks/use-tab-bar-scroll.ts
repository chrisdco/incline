import { AccessibilityInfo, Platform, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { makeMutable, withTiming } from 'react-native-reanimated';

/**
 * Android hide-on-scroll for the glass tab bar (iOS gets the same from
 * NativeTabs `minimizeBehavior="onScrollDown"`, natively).
 *
 * 0 = bar shown, 1 = bar tucked away. One value for the whole tab group:
 * the bar and the floating session bar both read it on the UI thread.
 * Scrolling down past the top hides; any deliberate scroll up, or getting
 * back near the top, shows. A tab switch always shows (GlassTabBar), and a
 * screen-reader user never loses the bar.
 */
export const tabBarHidden = makeMutable(0);

/** Ignore jitter smaller than this (px per event). */
const DELTA = 6;
/** Always shown while this close to the top. */
const TOP_ZONE = 48;
const TIMING = { duration: 220 } as const;

let screenReader = false;
AccessibilityInfo.isScreenReaderEnabled()
  .then((on) => {
    screenReader = on;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener('screenReaderChanged', (on) => {
  screenReader = on;
  if (on) showTabBar();
});

let lastY = 0;
/** JS-side target, so an in-flight animation isn't restarted every event. */
let target = 0;

function animateTo(next: 0 | 1): void {
  if (target === next) return;
  target = next;
  tabBarHidden.value = withTiming(next, TIMING);
}

export function showTabBar(): void {
  // Next screen may already be scrolled: its first event is a fresh baseline.
  lastY = Number.NaN;
  animateTo(0);
}

function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>): void {
  const y = e.nativeEvent.contentOffset.y;
  const dy = Number.isNaN(lastY) ? 0 : y - lastY;
  lastY = y;
  if (screenReader || y < TOP_ZONE) {
    animateTo(0);
    return;
  }
  if (Math.abs(dy) < DELTA) return;
  animateTo(dy > 0 ? 1 : 0);
}

const ANDROID_PROPS = { onScroll, scrollEventThrottle: 16 } as const;
const NONE = {} as const;

/** Spread onto a tab screen's main list/ScrollView. No-op on iOS. */
export function tabBarScrollProps(): typeof ANDROID_PROPS | typeof NONE {
  return Platform.OS === 'android' ? ANDROID_PROPS : NONE;
}
