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
  MonthShareCoverSlide,
  MonthShareDaysSlide,
  MonthShareGroupsSlide,
  MonthSharePrsSlide,
  MonthShareRadarSlide,
  MonthShareStatsSlide,
  MonthShareTopSlide,
} from '@/components/report/month-share-slides';
import { formatDuration, formatMonthLabel, formatVolume, previousMonthStart } from '@/db/calc';
import { useProfile, useMonthlyRecap } from '@/hooks/use-data';
import { useSettings } from '@/store/settings-store';
import {
  captureSharePng,
  downloadSharePng,
  nextShareBackgroundId,
  shareBackgroundById,
  shareHandleFromName,
  sharePngOrMessage,
  type ShareBackgroundId,
} from '@/lib/share-export';

type SlideId = 'stats' | 'prs' | 'days' | 'radar' | 'groups' | 'top' | 'cover';

const SLIDE_IDS: SlideId[] = ['stats', 'prs', 'days', 'radar', 'groups', 'top', 'cover'];

export default function ShareMonthScreen() {
  const { monthStartMs: monthStartParam } = useLocalSearchParams<{ monthStartMs?: string }>();
  const defaultStart = previousMonthStart();
  const monthStartMs = monthStartParam ? Number(monthStartParam) : defaultStart;
  const resolvedStart = Number.isFinite(monthStartMs) ? monthStartMs : defaultStart;
  const router = useRouter();
  const { toast } = useToast();
  const { unit, weekStartsOn } = useSettings();
  const { data: profile } = useProfile();
  const { data: recap, loading } = useMonthlyRecap(resolvedStart);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [bgId, setBgId] = useState<ShareBackgroundId>('navy');
  const captureRef = useRef<View>(null);

  const athleteName = profile?.name?.trim() || 'Athlete';
  const handle = shareHandleFromName(athleteName);
  const monthLabel = formatMonthLabel(resolvedStart);
  const prevLabel = formatMonthLabel(previousMonthStart(resolvedStart));
  const bg = shareBackgroundById(bgId);
  const chrome = useMemo(
    () => ({ backgroundColor: bg.card, handle }),
    [bg.card, handle],
  );

  const message = recap
    ? [`My month on Incline (${monthLabel})`, recap.insightLine, '', 'Train with me on Incline'].join('\n')
    : 'My month on Incline';

  const run = async (mode: 'stories' | 'more' | 'download') => {
    if (!recap || busy) return;
    setBusy(true);
    try {
      const uri = await captureSharePng(captureRef);
      if (mode === 'download') {
        await downloadSharePng({
          uri,
          filename: `incline-month-${recap.monthKey}.png`,
          title: 'Save monthly report',
          message,
        });
      } else {
        await sharePngOrMessage({
          uri,
          title: mode === 'stories' ? 'Share to Stories' : 'Share monthly report',
          message,
        });
      }
    } catch {
      toast({ title: 'Could not share month', variant: 'destructive' });
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

  const durationLabel = formatDuration(recap.durationSeconds);

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
                <MonthShareCoverSlide
                  athleteName={athleteName}
                  monthLabel={monthLabel}
                  insightLine={recap.insightLine}
                  chrome={chrome}
                />
              );
            }
            if (slide === 'stats') {
              return (
                <MonthShareStatsSlide
                  sessions={recap.sessions}
                  volumeLabel={formatVolume(recap.totalVolume, unit)}
                  durationLabel={durationLabel}
                  sets={recap.totalSets}
                  chrome={chrome}
                />
              );
            }
            if (slide === 'prs') return <MonthSharePrsSlide prs={recap.prs} unit={unit} chrome={chrome} />;
            if (slide === 'days') {
              return (
                <MonthShareDaysSlide
                  monthStartMs={recap.monthStartMs}
                  trainedDayMs={recap.trainedDayMs}
                  weekStartsOn={weekStartsOn}
                  chrome={chrome}
                />
              );
            }
            if (slide === 'radar') {
              return (
                <MonthShareRadarSlide
                  current={recap.muscles}
                  previous={recap.previousMuscles}
                  currentLabel={monthLabel}
                  previousLabel={prevLabel}
                  chrome={chrome}
                />
              );
            }
            if (slide === 'groups') return <MonthShareGroupsSlide muscles={recap.muscles} chrome={chrome} />;
            return (
              <MonthShareTopSlide
                exercises={recap.topExercises}
                unit={unit}
                formatVolumeFn={formatVolume}
                chrome={chrome}
              />
            );
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
