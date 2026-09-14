import { useCallback, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import ViewShot from 'react-native-view-shot';

import { Icon } from '@/components/common/icon';
import { Body } from '@/components/common/text';
import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';
import { Button } from '@/components/ui/button';
import { ShareActionBar } from '@/components/share/share-action-bar';
import { ShareSummaryCard } from '@/components/workout/share-summary-card';
import { getWorkoutLog, getWorkoutPrCount, getWorkoutMuscleSplit, type SessionWorkout } from '@/db/queries';
import { useProfile } from '@/hooks/use-data';
import { useSettings } from '@/store/settings-store';
import { useToast } from '@/components/ui/toast';
import { formatDuration, formatVolume } from '@/db/calc';
import {
  captureSharePng,
  downloadSharePng,
  nextShareBackgroundId,
  shareBackgroundById,
  shareHandleFromName,
  sharePngOrMessage,
  type ShareBackgroundId,
} from '@/lib/share-export';
import type { MuscleGroup } from '@/db/types';

function buildShareMessage(opts: {
  workoutName: string;
  durationSeconds: number;
  volumeLabel: string;
  completedSets: number;
  prCount: number;
}): string {
  const stats = [
    formatDuration(opts.durationSeconds),
    opts.volumeLabel,
    `${opts.completedSets} sets`,
  ];
  if (opts.prCount > 0) stats.push(`${opts.prCount} PR${opts.prCount === 1 ? '' : 's'}`);
  return [
    `Just finished ${opts.workoutName} on Incline`,
    stats.join(' · '),
    '',
    'Train with me on Incline 💪',
  ].join('\n');
}

export default function ShareWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const logId = Number(id);
  const router = useRouter();
  const { toast } = useToast();
  const { unit } = useSettings();
  const { data: profile } = useProfile();
  const [log, setLog] = useState<SessionWorkout | null>(null);
  const [prCount, setPrCount] = useState(0);
  const [muscles, setMuscles] = useState<MuscleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bgId, setBgId] = useState<ShareBackgroundId>('navy');
  const shareRef = useRef<View>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const [s, prs, split] = await Promise.all([
          getWorkoutLog(logId),
          getWorkoutPrCount(logId),
          getWorkoutMuscleSplit(logId),
        ]);
        if (!active) return;
        setLog(s);
        setPrCount(prs);
        setMuscles(split.map((x) => x.muscle));
        setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [logId]),
  );

  const athleteName = profile?.name?.trim() || 'Athlete';
  const handle = shareHandleFromName(athleteName);
  const volumeLabel = log ? formatVolume(log.totalVolume, unit) : '';
  const completedSets = log?.sets.filter((s) => s.completed).length ?? 0;
  const bg = shareBackgroundById(bgId);

  const run = async (mode: 'stories' | 'more' | 'download') => {
    if (!log || busy) return;
    setBusy(true);
    const message = buildShareMessage({
      workoutName: log.name,
      durationSeconds: log.durationSeconds,
      volumeLabel,
      completedSets,
      prCount,
    });
    try {
      const uri = await captureSharePng(shareRef);
      if (mode === 'download') {
        await downloadSharePng({
          uri,
          filename: `incline-workout-${log.id}.png`,
          title: 'Save workout card',
          message,
        });
      } else {
        await sharePngOrMessage({
          uri,
          title: mode === 'stories' ? 'Share to Stories' : 'Share workout',
          message,
        });
      }
    } catch {
      toast({ title: 'Could not share workout', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <PrimaryActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!log) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background px-6">
        <Body className="text-center font-semibold text-foreground">Workout not found</Body>
        <Button className="mt-4" onPress={() => router.back()}>Go back</Button>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <Body className="text-base font-semibold text-foreground">Share</Body>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Cancel">
          <Body className="text-primary">Cancel</Body>
        </Pressable>
      </View>

      <View className="flex-1 px-4 pt-4">
        <ViewShot options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
          <View ref={shareRef} collapsable={false} style={{ backgroundColor: bg.page, padding: 12, borderRadius: 28 }}>
            <ShareSummaryCard
              athleteName={athleteName}
              handle={handle}
              workoutName={log.name}
              durationSeconds={log.durationSeconds}
              volumeLabel={volumeLabel}
              completedSets={completedSets}
              prCount={prCount}
              muscles={muscles}
              backgroundColor={bg.card}
            />
          </View>
        </ViewShot>
      </View>

      <View className="px-4 pb-4">
        <ShareActionBar
          busy={busy}
          onBackground={() => setBgId((id) => nextShareBackgroundId(id))}
          onStories={() => void run('stories')}
          onMore={() => void run('more')}
          onDownload={() => void run('download')}
        />
      </View>
    </SafeAreaView>
  );
}
