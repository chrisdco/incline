import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Body from 'react-native-body-highlighter';

import { Caption } from '@/components/common/text';
import { cn } from '@/lib/cn';
import { hexToRgba, useThemeHex } from '@/lib/theme';
import {
  bodyPartsForMuscles,
  bodyPartsFromMuscleCounts,
  type BodyHighlightPart,
} from '@/lib/muscle-body-map';
import type { MuscleDistribution, MuscleGroup } from '@/db/types';

type Side = 'front' | 'back';

/**
 * Intensity → fill. Library uses `colors[intensity - 1]`; we also set `color`
 * explicitly so a short palette can never wipe the strongest muscles.
 */
function fillForIntensity(primary: string, intensity: number): string {
  const level = Math.max(1, Math.min(3, intensity));
  if (level >= 3) return primary;
  if (level === 2) return hexToRgba(primary, 0.72);
  return hexToRgba(primary, 0.45);
}

/** Reusable SVG body map — distribution counts or explicit muscle list. */
export function MuscleBodyMap({
  distribution,
  muscles,
  scale = 1,
  compact = false,
  showToggle = true,
  className,
}: {
  distribution?: MuscleDistribution[];
  muscles?: MuscleGroup[];
  scale?: number;
  /** Smaller chrome for cards / share / session. */
  compact?: boolean;
  showToggle?: boolean;
  className?: string;
}) {
  const theme = useThemeHex();
  const [side, setSide] = useState<Side>('front');

  const data = useMemo(() => {
    let parts: BodyHighlightPart[] = [];
    if (distribution && distribution.length > 0) {
      const counts: Partial<Record<MuscleGroup, number>> = {};
      for (const d of distribution) {
        if (d.sets > 0) counts[d.muscle] = (counts[d.muscle] ?? 0) + d.sets;
      }
      parts = bodyPartsFromMuscleCounts(counts);
    } else if (muscles && muscles.length > 0) {
      parts = bodyPartsForMuscles(muscles);
    }
    return parts.map((p) => ({
      slug: p.slug,
      intensity: p.intensity,
      color: fillForIntensity(theme.primary, p.intensity),
    }));
  }, [distribution, muscles, theme.primary]);

  const resolvedScale = compact ? Math.min(scale, 0.72) : scale;
  const toggle = showToggle && !compact;

  // Must be length ≥ max intensity (3). Duplicate primary is fine as a safety net.
  const intensityColors = [
    hexToRgba(theme.primary, 0.45),
    hexToRgba(theme.primary, 0.72),
    theme.primary,
  ];

  return (
    <View className={cn('items-center', className)}>
      {toggle ? (
        <View className="mb-3 flex-row gap-2">
          {(['front', 'back'] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setSide(s)}
              className={cn(
                'rounded-full px-3 py-1.5',
                side === s ? 'bg-primary/15' : 'bg-muted',
              )}
              accessibilityRole="button"
              accessibilityState={{ selected: side === s }}>
              <Caption className={side === s ? 'font-semibold text-primary-text' : undefined}>
                {s === 'front' ? 'Front' : 'Back'}
              </Caption>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Body
        data={data}
        side={side}
        gender="male"
        scale={resolvedScale}
        border={theme.border}
        defaultFill={theme.muted}
        colors={intensityColors}
      />
      {data.length === 0 ? (
        <Caption className="mt-2">No muscle data yet</Caption>
      ) : null}
    </View>
  );
}
