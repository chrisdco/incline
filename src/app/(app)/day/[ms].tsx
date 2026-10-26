import { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Body, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { WorkoutFeedCard } from '@/components/workout/workout-feed-card';
import { WorkoutLogActionsSheet } from '@/components/workout/workout-log-actions-sheet';
import { CardSkeleton } from '@/components/common/skeleton';
import {
  createTemplateFromWorkoutLog,
  deleteWorkout,
  getWorkoutFeedForDay,
} from '@/db/queries';
import { useSettings } from '@/store/settings-store';
import { useProfile } from '@/hooks/use-data';
import { useToast } from '@/components/ui/toast';
import { SCREEN_CONTENT, SCREEN_HEADER } from '@/lib/layout';
import type { FeedWorkoutLog } from '@/db/types';

/** Day detail: every completed workout for a calendar date, styled like the home feed. */
export default function DayScreen() {
  const { ms } = useLocalSearchParams<{ ms: string }>();
  const dayMs = Number(ms);
  const router = useRouter();
  const { toast } = useToast();
  const { unit } = useSettings();
  const { data: profile } = useProfile();
  const [state, setState] = useState<{ ms: number; items: FeedWorkoutLog[] | null }>({ ms: dayMs, items: null });
  const [menuLog, setMenuLog] = useState<FeedWorkoutLog | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const reload = () => {
    getWorkoutFeedForDay(dayMs).then((logs) => {
      setState({ ms: dayMs, items: logs });
    });
  };

  useEffect(() => {
    let active = true;
    getWorkoutFeedForDay(dayMs).then((logs) => {
      if (active) setState({ ms: dayMs, items: logs });
    });
    return () => {
      active = false;
    };
  }, [dayMs]);

  const items = state.ms === dayMs ? state.items : null;

  const dateLabel = new Date(dayMs).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

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
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className={`${SCREEN_HEADER} flex-row items-center gap-2`}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} className="p-1">
          <Icon icon={ChevronLeft} size={24} color="muted-foreground" />
        </Pressable>
        <View className="flex-1">
          <Body className="text-lg font-semibold text-foreground">{dateLabel}</Body>
          {items ? (
            <Caption>{items.length} workout{items.length !== 1 ? 's' : ''}</Caption>
          ) : null}
        </View>
      </View>

      {items === null ? (
        <View className="px-4 pt-4">
          <CardSkeleton />
        </View>
      ) : items.length === 0 ? (
        <View className="items-center px-6 py-20">
          <Body className="font-semibold text-foreground">No workouts this day</Body>
          <Caption className="mt-1 text-center">Tap another date on the calendar to see its history.</Caption>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={({ item }) => (
            <WorkoutFeedCard
              log={item}
              unit={unit}
              profileName={profile?.name?.trim() || 'Athlete'}
              avatarUrl={profile?.avatarUrl}
              onMenuPress={() => setMenuLog(item)}
            />
          )}
          keyExtractor={(item) => String(item.id)}
          ItemSeparatorComponent={() => <View className="h-3" />}
          contentContainerStyle={{ ...SCREEN_CONTENT, paddingTop: 12 }}
          showsVerticalScrollIndicator={false}
        />
      )}

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
            <Button
              variant="destructive"
              onPress={async () => {
                if (deleteId === null) return;
                await deleteWorkout(deleteId);
                setDeleteId(null);
                reload();
                toast({ title: 'Workout deleted', variant: 'info' });
              }}>
              Delete
            </Button>
          </>
        }
      />
    </SafeAreaView>
  );
}
