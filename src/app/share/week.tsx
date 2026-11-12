import { useMemo, useRef, useState } from 'react';
import { View, type ViewInstance } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';
import { ErrorState } from '@/components/common/states';
import { useToast } from '@/components/ui/toast';
import { ShareHeader } from '@/components/share/share-header';
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
  const unit = useSettings((s) => s.unit);
  const { data: profile } = useProfile();
  const { data: recap, loading, error, refetch } = useWeeklyRecap(weekStartMs);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [settling, setSettling] = useState(false);
  const [bgId, setBgId] = useState<ShareBackgroundId>('navy');
  const captureRef = useRef<ViewInstance>(null);

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
    if (!recap || busy || settling) return;
    setBusy(true);
    // Computed outside the try: the compiler can't lower conditionals inside one.
    const shareTitle = mode === 'stories' ? 'Share to Stories' : 'Share weekly report';
    try {
      const uri = await captureSharePng(captureRef);
      if (!uri) {
        toast({ title: 'Image capture failed', description: 'Sharing as text instead.', variant: 'warning' });
      }
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
          title: shareTitle,
          message,
        });
      }
    } catch {
      toast({ title: 'Could not share week', variant: 'destructive' });
    }
    setBusy(false);
  };

  if (loading && !recap) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <PrimaryActivityIndicator />
      </SafeAreaView>
    );
  }

  // A failed or empty load must offer a way out, never an endless spinner (#155).
  if (!recap) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <ErrorState
          title="Could not load this card"
          description={error ? 'The recap query failed. Your data is safe.' : 'No recap for this week yet.'}
          onRetry={refetch}
        />
      </SafeAreaView>
    );
  }

  const volumeLabel = formatVolume(recap.totalVolume, unit);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <ShareHeader onClose={() => router.back()} />

      <View className="flex-1 justify-center">
        <ShareCardPager
          data={SLIDE_IDS}
          index={index}
          onIndexChange={setIndex}
          captureRef={captureRef}
          pageBackground={bg.page}
          onSettlingChange={setSettling}
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
          disabled={settling}
          onBackground={() => setBgId((id) => nextShareBackgroundId(id))}
          onStories={() => void run('stories')}
          onMore={() => void run('more')}
          onDownload={() => void run('download')}
        />
      </View>
    </SafeAreaView>
  );
}
