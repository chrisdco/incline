import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Dumbbell, Pause, Play } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { cn } from '@/lib/cn';
import { hexToRgba, useThemeHex } from '@/lib/theme';
import { useAppColorScheme } from '@/lib/use-color-scheme';
import { useSettings } from '@/store/settings-store';
import { useExerciseMedia, type ExerciseMediaInput } from '@/hooks/use-exercise-media';

/** How long each illustration frame stays on screen while cycling. */
const FRAME_INTERVAL_MS = 600;

/**
 * Dark-framed exercise artwork with a soft vignette. Renders either the remote
 * demonstration GIF or a 3-frame illustration cycle, depending on the user's
 * media preference (see useExerciseMedia).
 */
export function ExerciseMedia({
  name,
  aliases,
  imageUrl,
  height = 200,
  className,
  showPause = true,
}: ExerciseMediaInput & {
  height?: number;
  className?: string;
  showPause?: boolean;
}) {
  const colors = useThemeHex();
  const scheme = useAppColorScheme();
  const isDark = scheme === 'dark';
  const animation = useSettings((s) => s.exerciseMediaAnimation);
  const source = useExerciseMedia({ name, aliases, imageUrl });
  const imageRef = useRef<Image>(null);
  const [paused, setPaused] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);

  const cycling =
    source?.kind === 'illustration' && animation === 'cycle' && !paused && source.frames.length > 1;

  useEffect(() => {
    if (!cycling) return;
    const frames = source.kind === 'illustration' ? source.frames : [];
    const timer = setInterval(
      () => setFrameIndex((i) => (i + 1) % Math.max(frames.length, 1)),
      FRAME_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [cycling, source]);

  if (!source) {
    return (
      <View className={cn('mb-4 items-center justify-center rounded-2xl border border-border bg-surface2 py-10', className)}>
        <Icon icon={Dumbbell} size={40} color="muted-foreground" />
      </View>
    );
  }

  const togglePause = async () => {
    const next = !paused;
    setPaused(next);
    try {
      // Native controls only apply to animated GIFs; frame cycling pauses via state.
      if (next) await imageRef.current?.stopAnimating();
      else await imageRef.current?.startAnimating();
    } catch {
      // Native animation controls are best-effort on some platforms.
    }
  };

  return (
    <View className={cn('mb-4 overflow-hidden rounded-2xl border border-border bg-surface2 p-2', className)}>
      <View className="overflow-hidden rounded-xl" style={{ height }}>
        <Image
          ref={imageRef}
          key={source.kind === 'gif' ? source.uri : undefined}
          source={
            source.kind === 'gif'
              ? { uri: source.uri }
              : { uri: source.frames[frameIndex % source.frames.length] ?? source.frames[0] }
          }
          style={{ width: '100%', height }}
          contentFit="contain"
          autoplay
          transition={source.kind === 'illustration' ? 150 : 0}
          accessibilityLabel="Exercise demonstration"
        />
        <LinearGradient
          pointerEvents="none"
          colors={[
            'transparent',
            hexToRgba(colors.surface2, isDark ? 0.55 : 0.35),
          ]}
          locations={[0.55, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        />
        {showPause && (source.kind === 'gif' || source.frames.length > 1) ? (
          <Pressable
            onPress={togglePause}
            accessibilityRole="button"
            accessibilityLabel={paused ? 'Play demonstration' : 'Pause demonstration'}
            className="absolute right-2 top-2 h-11 w-11 items-center justify-center rounded-full bg-black/50">
            <Icon icon={paused ? Play : Pause} size={16} color="white" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Circular thumb for feed / summary / edit rows. Always renders a single
 * static frame for list performance.
 */
export function ExerciseThumb({
  name,
  aliases,
  imageUrl,
  size = 44,
  className,
}: ExerciseMediaInput & {
  size?: number;
  className?: string;
}) {
  const source = useExerciseMedia({ name, aliases, imageUrl });

  if (!source) {
    return (
      <View
        className={cn('items-center justify-center rounded-full bg-muted', className)}
        style={{ width: size, height: size }}>
        <Icon icon={Dumbbell} size={Math.round(size * 0.4)} color="muted-foreground" />
      </View>
    );
  }

  const uri = source.kind === 'gif' ? source.uri : source.frames[0];
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className={cn('bg-muted', className)}
      contentFit="cover"
    />
  );
}
