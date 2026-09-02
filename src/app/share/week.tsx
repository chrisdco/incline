import { useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body } from '@/components/common/text';
import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';
import { useToast } from '@/components/ui/toast';
import { ShareActionBar } from '@/components/share/share-action-bar';
import { ShareCardPager } from '@/components/share/share-card-pager';
import {
  WeekShareCoverSlide,
  WeekShareMusclesSlide,
  WeekSharePrsSlide,
  WeekShareStatsSlide,
} from '@/components/report/week-share-slides';
import { formatVolume, startOfWeek, formatWeekRangeLabel } from '@/db/calc';
import { useProfile, useWeeklyRecap } from '@/hooks/use-data';
import { useSettings } from '@/store/settings-store';
import {
  captureSharePng,
  downloadSharePng,
  nextShareBackgroundId,
  shareBackgroundById,
  sharePngOrMessage,
  type ShareBackgroundId,
} from '@/lib/share-export';
import type { MuscleGroup } from '@/db/types';

type SlideId = 'cover' | 'stats' | 'prs' | 'muscles';
const SLIDE_IDS: SlideId[] = ['cover', 'stats', 'prs', 'muscles'];

export default function ShareWeekScreen() {
  const { weekStartMs: weekStartParam } = useLocalSearchParams<{ weekStartMs?: string }>();
  const [defaultWeekStart] = useState(() => startOfWeek(Date.now()));
  const weekStartMs = weekStartParam ? Number(weekStartParam) : defaultWeekStart;
  const router = useRouter();
  const { toast } = useToast();
  const { unit } = useSettings();
  const { data: profile } = useProfile();
  const { data: recap, loading } = useWeeklyRecap(weekStartMs);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [bgId, setBgId] = useState<ShareBackgroundId>('navy');
  const captureRef = useRef<View>(null);

  const athleteName = profile?.name?.trim() || 'Athlete';
  const rangeLabel = formatWeekRangeLabel(weekStartMs);
  const bg = shareBackgroundById(bgId);
  const muscles = useMemo(
    () => (recap?.muscles ?? []).map((m) => m.muscle) as MuscleGroup[],
    [recap?.muscles],
  );

  const message = recap
    ? [`My week on Incline (${rangeLabel})`, recap.insightLine, '', 'Train with me on Incline'].join('\n')
    : 'My week on Incline';

  const run = async (mode: 'stories' | 'more' | 'download') => {
    if (!recap || busy) return;
    setBusy(true);
    try {
      const uri = await captureSharePng(captureRef);
      if (mode === 'download') {
        await downloadSharePng({
          uri,
          filename: 'incline-week.png',
          title: 'Save weekly report',
          message,
        });
      } else {
        await sharePngOrMessage({
          uri,
          title: mode === 'stories' ? 'Share to Stories' : 'Share weekly report',
          message,
        });
      }
    } catch {
      toast({ title: 'Could not share week', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (loading || !recap) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <PrimaryActivityIndicator />
      </SafeAreaView>
    );
  }

  const volumeLabel = formatVolume(recap.totalVolume, unit);

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

      <View className="flex-1 justify-center">
        <ShareCardPager
          data={SLIDE_IDS}
          index={index}
          onIndexChange={setIndex}
          captureRef={captureRef}
          pageBackground={bg.page}
          renderCard={(slide) => {
            if (slide === 'cover') {
              return (
                <WeekShareCoverSlide
                  athleteName={athleteName}
                  rangeLabel={rangeLabel}
                  insightLine={recap.insightLine}
                  backgroundColor={bg.card}
                />
              );
            }
            if (slide === 'stats') {
              return (
                <WeekShareStatsSlide
                  sessions={recap.sessions}
                  volumeLabel={volumeLabel}
                  sets={recap.totalSets}
                  streak={recap.streak}
                  volumeDeltaPct={recap.volumeDeltaPct}
                  backgroundColor={bg.card}
                />
              );
            }
            if (slide === 'prs') {
              return <WeekSharePrsSlide prs={recap.prs} unit={unit} backgroundColor={bg.card} />;
            }
            return <WeekShareMusclesSlide muscles={muscles} backgroundColor={bg.card} />;
          }}
        />
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
