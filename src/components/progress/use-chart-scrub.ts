import { useEffect } from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import {
  useExclusiveGestures,
  usePanGesture,
  useTapGesture,
} from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";

import { useHaptics } from "@/hooks/use-haptics";

export type ScrubSource = "drag" | "tap" | "release";

/**
 * Press-and-drag scrubbing for charts with evenly spaced points (Apple
 * Health / Robinhood pattern). A horizontal drag selects the point nearest
 * the finger, with a selection haptic each time the point changes; a tap
 * selects one point. A vertical drag fails the pan, so the page still
 * scrolls.
 *
 * Geometry is in the detector's coordinates: point i sits at
 * `first + i * step`. The selected index lives in a shared value so overlays
 * move on the UI thread; `onSelect` runs on JS only when the index changes,
 * and once with `null` on release.
 */
export function useChartScrub({
  count,
  first,
  step,
  onSelect,
}: {
  count: number;
  first: number;
  step: number;
  onSelect: (index: number | null, source: ScrubSource) => void;
}): {
  gesture: ReturnType<typeof useExclusiveGestures>;
  index: SharedValue<number>;
} {
  const index = useSharedValue(-1);
  const geo = useSharedValue({ count, first, step });
  useEffect(() => {
    geo.value = { count, first, step };
  }, [geo, count, first, step]);

  const { selection } = useHaptics();
  const emit = (i: number | null, source: ScrubSource) => {
    if (source === "drag") selection();
    onSelect(i, source);
  };

  const nearest = (x: number) => {
    "worklet";
    const g = geo.value;
    if (g.count <= 0 || g.step <= 0) return 0;
    const i = Math.round((x - g.first) / g.step);
    return Math.min(g.count - 1, Math.max(0, i));
  };

  const pan = usePanGesture({
    activeOffsetX: [-6, 6],
    failOffsetY: [-12, 12],
    onActivate: (e) => {
      "worklet";
      const i = nearest(e.x);
      index.value = i;
      scheduleOnRN(emit, i, "drag");
    },
    onUpdate: (e) => {
      "worklet";
      const i = nearest(e.x);
      if (i === index.value) return;
      index.value = i;
      scheduleOnRN(emit, i, "drag");
    },
    onDeactivate: () => {
      "worklet";
      index.value = -1;
      scheduleOnRN(emit, null, "release");
    },
  });

  const tap = useTapGesture({
    onDeactivate: (e) => {
      "worklet";
      if (e.canceled) return;
      const i = nearest(e.x);
      index.value = i;
      scheduleOnRN(emit, i, "tap");
    },
  });

  const gesture = useExclusiveGestures(pan, tap);
  return { gesture, index };
}
