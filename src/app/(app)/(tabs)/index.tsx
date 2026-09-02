import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Play, Plus, ArrowRight, Dumbbell } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Hero, Body, Caption } from '@/components/common/text';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { StatCard } from '@/components/common/stat-card';
import { WorkoutFeedCard } from '@/components/workout/workout-feed-card';
import { WorkoutLogActionsSheet } from '@/components/workout/workout-log-actions-sheet';
import { TemplatePickerSheet } from '@/components/workout/template-picker-sheet';
import { ActiveSessionConflictDialog } from '@/components/workout/active-session-conflict-dialog';
import { MuscleBodyMap } from '@/components/progress/muscle-body-map';
import { CardSkeleton } from '@/components/common/skeleton';
import { HomeContextCard } from '@/components/home/home-context-card';
import { MonthlyReportPromo } from '@/components/home/monthly-report-promo';
import { useProfile, useSuggestedTemplate, useProgressStats, useWorkoutFeedLogs, useTodayProgramSlot } from '@/hooks/use-data';
import { useActiveSession } from '@/hooks/use-active-session';
import { useHomeCoachingContext } from '@/hooks/use-home-coaching-context';
import { useSettings } from '@/store/settings-store';
import { useActiveWorkout } from '@/store/active-workout-store';
import { useToast } from '@/components/ui/toast';
import { useHaptics } from '@/hooks/use-haptics';
import { startWorkout, discardWorkout, deleteWorkout, createTemplateFromWorkoutLog } from '@/db/queries';
import { formatVolume, formatFullDate } from '@/db/calc';
import { METRIC_ICONS } from '@/lib/metric-icons';
import { homeWeekCaption } from '@/lib/home-context';
import { ReadinessCheckIn } from '@/components/home/readiness-checkin';
import type { FeedWorkoutLog, MuscleGroup } from '@/db/types';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function FeedSeparator() {
  return <View className="h-3" />;
}

export default function HomeScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const { impact } = useHaptics();
  const { unit, weeklyWorkoutGoal, dismissedAnnouncementIds, dismissAnnouncement } = useSettings();
  const { data: profile, refetch: refetchProfile } = useProfile();
  const { data: suggested, loading: sugLoading } = useSuggestedTemplate();
  const { data: todaySlot, loading: todayLoading, refetch: refetchToday } = useTodayProgramSlot();
  const { data: stats, loading: statsLoading } = useProgressStats();
  const { session } = useActiveSession();
  const clear = useActiveWorkout((s) => s.clear);
  const feed = useWorkoutFeedLogs();
  const refreshFeed = feed.refresh;
  const { consistency, contextCards, narrationHeadline, readiness, onReadiness } = useHomeCoachingContext({
    stats,
    unit,
    weeklyWorkoutGoal,
    dismissedAnnouncementIds,
    onReadinessImpact: impact,
  });
  const [starting, setStarting] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<{ templateId: number | null; name: string } | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [menuLog, setMenuLog] = useState<FeedWorkoutLog | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [today] = useState(() => formatFullDate(Date.now()));
  const didFocus = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (didFocus.current) {
        refetchProfile();
        refreshFeed();
        refetchToday();
      } else {
        didFocus.current = true;
      }
    }, [refetchProfile, refreshFeed, refetchToday]),
  );

  const doStart = async (templateId: number | null, name: string) => {
    setStarting(true);
    impact();
    try {
      const logId = await startWorkout(templateId, name);
      useActiveWorkout.getState().setActive(logId);
      router.push(`/session/${logId}`);
    } catch {
      toast({ title: 'Could not start workout', variant: 'destructive' });
    } finally {
      setStarting(false);
    }
  };

  const beginTemplate = async (id: number, name: string) => {
    if (session) {
      setPendingStart({ templateId: id, name });
      setConflictOpen(true);
      return;
    }
    await doStart(id, name);
  };

  const quickStart = () => {
    setPickerOpen(true);
  };

  const handleTemplateStart = (templateId: number | null, name: string) => {
    if (session) {
      setPendingStart({ templateId, name });
      setConflictOpen(true);
      return;
    }
    void doStart(templateId, name);
  };

  const resumeActive = () => {
    setConflictOpen(false);
    if (session) router.push(`/session/${session.id}`);
    setPendingStart(null);
  };

  const startNewAndDiscard = async () => {
    setConflictOpen(false);
    if (session) {
      await discardWorkout(session.id);
      clear();
    }
    if (pendingStart) {
      await doStart(pendingStart.templateId, pendingStart.name);
    }
    setPendingStart(null);
  };

  const name = profile?.name?.trim() || 'Athlete';
  const hasData = (stats?.totalSessions ?? 0) > 0;
  const streak = stats?.streak ?? 0;
  const thisWeek = stats?.weeklyVolume?.[stats.weeklyVolume.length - 1];
  const weekSessions = consistency?.sessionsThisWeek ?? thisWeek?.sessions ?? 0;
  const weekVolume = thisWeek?.volume ?? 0;
  const weekInsightLine = homeWeekCaption(stats, unit);
  const goalLabel =
    weeklyWorkoutGoal > 0 && consistency
      ? `${consistency.sessionsThisWeek}/${weeklyWorkoutGoal}`
      : null;
  const suggestedMuscles = (suggested?.exercises ?? [])
    .map((e) => e.exercise?.primaryMuscle)
    .filter((m, i, arr): m is MuscleGroup => !!m && arr.indexOf(m) === i);

  const programWorkout = todaySlot && !todaySlot.isRestDay ? todaySlot.workout : null;
  const todayMuscles = programWorkout ? todaySlot?.muscles ?? [] : suggestedMuscles;
  const heroLoading = sugLoading || todayLoading;

  const renderHeader = () => (
    <View className="px-4">
      <View className="flex-row items-center gap-2">
        <Caption>{greeting()}</Caption>
        {hasData && streak > 0 ? (
          <Caption className="flex-row items-center text-warning">
            <Icon icon={METRIC_ICONS.streak} size={12} color="warning" /> {streak}w streak
          </Caption>
        ) : null}
      </View>
      <Hero className="mt-0.5">Let&apos;s train, {name.split(' ')[0]}</Hero>
      <Body className="mt-1 text-muted-foreground">{today}</Body>
      {hasData && weekInsightLine ? (
        <Caption className="mt-2 text-foreground/80">{weekInsightLine}</Caption>
      ) : null}

      <View className="mt-4">
        <ReadinessCheckIn value={readiness} onChange={(level) => { void onReadiness(level); }} />
      </View>

      {contextCards.length > 0 ? (
        <View className="mt-4 gap-3">
          {contextCards.map((card, i) =>
            card.kind === 'report_month' ? (
              <MonthlyReportPromo
                key={card.id}
                card={card}
                index={i}
                onDismiss={card.dismissKey ? dismissAnnouncement : undefined}
              />
            ) : (
              <HomeContextCard
                key={card.id}
                card={card}
                index={i}
                onDismiss={card.dismissKey ? dismissAnnouncement : undefined}
              />
            ),
          )}
          {narrationHeadline ? (
            <Caption className="text-muted-foreground">{narrationHeadline}</Caption>
          ) : null}
        </View>
      ) : null}

      <View className="mt-6 gap-3">
        {heroLoading ? (
          <CardSkeleton />
        ) : programWorkout ? (
          <Pressable onPress={() => router.push(`/workout/${programWorkout.templateId}`)}>
            <Card elevation="raised">
              <View className="flex-row items-center justify-between">
                <Caption>Today · {todaySlot!.program.name}</Caption>
                {programWorkout.estimatedMinutes ? (
                  <Caption>{programWorkout.estimatedMinutes} min</Caption>
                ) : null}
              </View>
              <Body className="mt-2 font-semibold text-foreground">
                {programWorkout.templateName ?? 'Workout'}
              </Body>
              <Caption className="mt-1">Week {todaySlot!.week}</Caption>
              {todayMuscles.length > 0 ? (
                <MuscleBodyMap muscles={todayMuscles} compact className="mt-3" />
              ) : null}
              <Button
                className="mt-4"
                leftIcon={<Icon icon={Play} size={16} color="primary-foreground" />}
                onPress={() =>
                  beginTemplate(programWorkout.templateId, programWorkout.templateName ?? todaySlot!.program.name)
                }
                disabled={starting}>
                Start workout
              </Button>
            </Card>
          </Pressable>
        ) : todaySlot?.isRestDay ? (
          <Card elevation="raised">
            <Caption>Today · {todaySlot.program.name}</Caption>
            <Body className="mt-2 font-semibold text-foreground">Rest day</Body>
            <Body className="mt-1 text-sm text-muted-foreground">
              No session scheduled. Start something else when you&apos;re ready.
            </Body>
            <Button
              className="mt-4"
              variant="outline"
              leftIcon={<Icon icon={Plus} size={16} color="primary" />}
              onPress={quickStart}
              disabled={starting}>
              Quick start
            </Button>
          </Card>
        ) : suggested ? (
          <Pressable onPress={() => router.push(`/workout/${suggested.id}`)}>
            <Card elevation="raised">
              <View className="flex-row items-center justify-between">
                <Caption>Today&apos;s workout</Caption>
                <Caption>{suggested.estimatedMinutes} min</Caption>
              </View>
              <Body className="mt-2 font-semibold text-foreground">{suggested.name}</Body>
              <Body className="mt-1 text-sm text-muted-foreground" numberOfLines={2}>
                {suggested.description}
              </Body>
              {suggestedMuscles.length > 0 ? (
                <MuscleBodyMap muscles={suggestedMuscles} compact className="mt-3" />
              ) : null}
              <Button
                className="mt-4"
                leftIcon={<Icon icon={Play} size={16} color="primary-foreground" />}
                onPress={() => beginTemplate(suggested.id, suggested.name)}
                disabled={starting}>
                Start workout
              </Button>
              <Caption className="mt-3 text-center">Suggested from your recent training</Caption>
            </Card>
          </Pressable>
        ) : null}

        {hasData && !todaySlot?.isRestDay ? (
          <Button
            variant="outline"
            size="lg"
            leftIcon={<Icon icon={Plus} size={18} color="primary" />}
            onPress={quickStart}
            disabled={starting}>
            Quick start
          </Button>
        ) : null}
      </View>

      {hasData ? (
        <View className="mt-6 flex-row gap-3">
          <StatCard label="This week" value={goalLabel ?? weekSessions} icon={<Icon icon={METRIC_ICONS.sessions} size={16} color="muted-foreground" />} />
          <StatCard
            label="Volume"
            value={formatVolume(weekVolume, unit)}
            icon={<Icon icon={METRIC_ICONS.volume} size={16} color="info" />}
          />
          <StatCard label="Streak" value={`${streak}w`} icon={<Icon icon={METRIC_ICONS.streak} size={16} color="warning" />} />
        </View>
      ) : statsLoading ? (
        <View className="mt-6"><CardSkeleton /></View>
      ) : (
        <View className="mt-6">
          <Card className="items-center p-6">
            <View className="h-14 w-14 items-center justify-center rounded-3xl bg-muted">
              <Icon icon={Dumbbell} size={26} color="muted-foreground" />
            </View>
            <Body className="mt-4 text-center font-semibold text-foreground">No workouts yet 🏋️</Body>
            <Caption className="mt-1 text-center">
              Finish your first session and your history, streaks, and progress will all show up here.
            </Caption>
            <View className="mt-5 w-full gap-2">
              <Button
                leftIcon={<Icon icon={Plus} size={16} color="primary-foreground" />}
                onPress={() => setPickerOpen(true)}
                disabled={starting}>
                Choose a routine
              </Button>
              <Button
                variant="outline"
                leftIcon={<Icon icon={Play} size={16} color="primary" />}
                onPress={() => handleTemplateStart(null, 'Quick Workout')}
                disabled={starting}>
                Start empty workout
              </Button>
            </View>
            <View className="mt-6 w-full border-t border-border pt-4">
              <Caption className="text-center font-medium text-foreground">How it works</Caption>
              <View className="mt-3 flex-row items-center justify-center gap-4">
                <View className="items-center gap-1">
                  <Icon icon={METRIC_ICONS.sets} size={18} color="muted-foreground" />
                  <Caption>Log your sets</Caption>
                </View>
                <Icon icon={ArrowRight} size={14} color="muted-foreground" />
                <View className="items-center gap-1">
                  <Icon icon={METRIC_ICONS.volume} size={18} color="muted-foreground" />
                  <Caption>Track progress</Caption>
                </View>
                <Icon icon={ArrowRight} size={14} color="muted-foreground" />
                <View className="items-center gap-1">
                  <Icon icon={METRIC_ICONS.streak} size={18} color="muted-foreground" />
                  <Caption>Build streaks</Caption>
                </View>
              </View>
            </View>
          </Card>
        </View>
      )}

      {hasData && feed.items.length > 0 ? (
        <Caption className="mb-3 mt-6 text-base font-semibold text-foreground">Recent workouts</Caption>
      ) : null}
    </View>
  );

  const renderItem = ({ item }: { item: FeedWorkoutLog }) => (
    <WorkoutFeedCard
      log={item}
      unit={unit}
      profileName={profile?.name?.trim() || 'Athlete'}
      avatarUrl={profile?.avatarUrl}
      onMenuPress={() => setMenuLog(item)}
    />
  );

  const keyExtractor = (item: FeedWorkoutLog) => String(item.id);

  const onEndReached = () => {
    if (feed.hasMore && !feed.loading) feed.loadMore();
  };

  const onSaveAsRoutine = async () => {
    if (!menuLog || savingTemplate) return;
    const logId = menuLog.id;
    setSavingTemplate(true);
    setMenuLog(null);
    try {
      const templateId = await createTemplateFromWorkoutLog(logId);
      toast({ title: 'Routine saved', description: 'Open it from Workouts anytime.', variant: 'success' });
      router.push(`/template/${templateId}` as Href);
    } catch (e) {
      toast({
        title: 'Could not save routine',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <FlatList
        data={feed.items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={renderHeader()}
        ListEmptyComponent={feed.loading ? <View className="mt-8 px-4"><CardSkeleton /></View> : null}
        ListFooterComponent={feed.loading && feed.items.length > 0 ? <View className="px-4 py-4"><CardSkeleton /></View> : null}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 32 }}
        ItemSeparatorComponent={FeedSeparator}
        showsVerticalScrollIndicator={false}
      />

      <TemplatePickerSheet open={pickerOpen} onOpenChange={setPickerOpen} onStart={handleTemplateStart} />

      <ActiveSessionConflictDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        onResume={resumeActive}
        onStartNew={startNewAndDiscard}
        onCancel={() => setPendingStart(null)}
      />

      <WorkoutLogActionsSheet
        open={menuLog !== null}
        onOpenChange={(open) => { if (!open) setMenuLog(null); }}
        title={menuLog?.name ?? ''}
        canSaveAsRoutine={!savingTemplate}
        onEdit={() => {
          if (!menuLog) return;
          router.push({ pathname: '/edit-workout/[id]', params: { id: String(menuLog.id) } } as Href);
        }}
        onSaveAsRoutine={onSaveAsRoutine}
        onDelete={() => {
          if (!menuLog) return;
          setDeleteId(menuLog.id);
          setMenuLog(null);
        }}
      />

      <Dialog
        open={deleteId !== null}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title="Delete workout?"
        description="This workout will be permanently removed from your history."
        footer={
          <>
            <Button variant="outline" onPress={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onPress={async () => {
              if (deleteId !== null) {
                await deleteWorkout(deleteId);
                feed.refresh();
                setDeleteId(null);
                toast({ title: 'Workout deleted', variant: 'info' });
              }
            }}>Delete</Button>
          </>
        }
      />
    </SafeAreaView>
  );
}
