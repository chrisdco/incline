import { useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronUp, Trash2 } from 'lucide-react-native';

import { cn } from '@/lib/cn';
import { Icon } from '@/components/common/icon';
import { Text } from '@/components/ui/text';
import { formatDuration } from '@/db/calc';
import { getWorkoutLog } from '@/db/queries';
import { setCachedSession } from '@/db/session-cache';

/**
 * Floating session bar shown above the tab bar when a workout is in progress.
 * Matches reference app style.
 */
export function ActiveSessionBar({
  logId,
  name,
  startedAt,
  nextExercise,
  refetch,
  onDiscard,
  className,
}: {
  logId: number;
  name?: string;
  startedAt?: number;
  nextExercise?: string;
  refetch?: () => void;
  onDiscard?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(() => (startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0));

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [startedAt]);

  useEffect(() => {
    if (!refetch) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch();
    });
    return () => sub.remove();
  }, [refetch]);

  const displayName = name ?? 'Workout';

  // Warm the reopen cache before pushing: by the time the push animation
  // finishes, the session screen usually mounts onto cached rows instead of
  // a spinner. Fire-and-forget — mount still refreshes from SQLite.
  const open = () => {
    void getWorkoutLog(logId)
      .then((s) => {
        if (s) setCachedSession(s);
      })
      .catch(() => {});
    router.push(`/session/${logId}`);
  };

  return (
    <View
      style={{ marginHorizontal: 16, marginBottom: 8, borderRadius: 9999 }}
      className={cn('flex-row items-center border border-border bg-surface2 px-3 py-3 shadow-lg', className)}>
      {/* Whole bar opens — only the trash circle deletes. */}
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel="Open workout"
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        className="h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Icon icon={ChevronUp} size={30} color="foreground" />
      </Pressable>

      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel="Open workout"
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        className="flex-1 flex-row items-center px-2">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <View className="h-3 w-3 rounded-full bg-success" />
            <Text className="text-base font-semibold text-foreground">{displayName}</Text>
            {startedAt ? (
              <Text className="text-base text-muted-foreground">{formatDuration(elapsed)}</Text>
            ) : null}
          </View>
          {nextExercise ? (
            <Text className="text-base text-muted-foreground" numberOfLines={1}>{nextExercise}</Text>
          ) : null}
        </View>
      </Pressable>

      {onDiscard ? (
        <Pressable
          onPress={onDiscard}
          accessibilityRole="button"
          accessibilityLabel="Discard workout"
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          className="h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Icon icon={Trash2} size={28} color="destructive" />
        </Pressable>
      ) : null}
    </View>
  );
}
