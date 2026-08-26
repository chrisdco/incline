import { useMemo } from 'react';

import { useSettings } from '@/store/settings-store';
import type { DevExerciseMediaOverride, ExerciseMediaStyle } from '@/db/types';
import { getIllustrationFrames, resolveIllustrationSlug } from '@/lib/exercise-illustrations';

/** What a media component should render right now. */
export type ExerciseMediaSource =
  | { kind: 'gif'; uri: string }
  | { kind: 'illustration'; frames: string[] };

export interface ExerciseMediaInput {
  name: string;
  aliases?: readonly string[];
  imageUrl?: string | null;
}

function styleFromPrefs(
  pref: ExerciseMediaStyle,
  devOverride: DevExerciseMediaOverride,
): 'auto' | 'gif' | 'illustration' {
  if (devOverride !== 'off') return devOverride === 'auto' ? 'auto' : devOverride;
  return pref;
}

/**
 * Decide between the remote GIF and a bundled-catalog illustration for one
 * exercise according to user preference + dev override. Pure derivation from
 * settings — no database writes, fully reversible.
 */
export function useExerciseMedia(input: ExerciseMediaInput | null | undefined): ExerciseMediaSource | null {
  const exerciseMediaStyle = useSettings((s) => s.exerciseMediaStyle);
  const devExerciseMediaOverride = useSettings((s) => s.devExerciseMediaOverride);

  return useMemo(() => {
    if (!input) return null;
    const mode = styleFromPrefs(exerciseMediaStyle, devExerciseMediaOverride);
    if (mode === 'gif') return input.imageUrl ? { kind: 'gif', uri: input.imageUrl } : null;
    if (mode === 'illustration') {
      const slug = resolveIllustrationSlug(input.name, input.aliases);
      return slug ? { kind: 'illustration', frames: getIllustrationFrames(slug) } : null;
    }
    // auto / hybrid: GIF first, illustration fills the gaps.
    if (input.imageUrl) return { kind: 'gif', uri: input.imageUrl };
    const slug = resolveIllustrationSlug(input.name, input.aliases);
    return slug ? { kind: 'illustration', frames: getIllustrationFrames(slug) } : null;
  }, [input, exerciseMediaStyle, devExerciseMediaOverride]);
}
