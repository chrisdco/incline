import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pencil, Play, Check } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Heading, Body, Caption } from '@/components/common/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/common/states';
import { ListSkeleton } from '@/components/common/skeleton';
import { ActiveSessionConflictDialog } from '@/components/workout/active-session-conflict-dialog';
import { useToast } from '@/components/ui/toast';
import { useHaptics } from '@/hooks/use-haptics';
import { useActiveSession } from '@/hooks/use-active-session';
import { useActiveWorkout } from '@/store/active-workout-store';
import {
  getProgram,
  getActiveProgramState,
  setActiveProgram,
  clearActiveProgram,
  startWorkout,
  discardWorkout,
  weekdayMon1,
} from '@/db/queries';
import { setCachedSession } from '@/db/session-cache';
import { SCREEN_CONTENT } from '@/lib/layout';
import type { Program, ProgramWorkout } from '@/db/types';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function ProgramDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const programId = Number(id);
  const navigation = useNavigation();
  const router = useRouter();
  const { toast } = useToast();
  const { impact } = useHaptics();
  const { session } = useActiveSession();
  const clear = useActiveWorkout((s) => s.clear);

  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<{ templateId: number; name: string } | null>(null);
  const [todayDay] = useState(() => weekdayMon1(Date.now()));

  const load = useCallback(async () => {
    try {
      const p = await getProgram(programId);
      if (!p) {
        setError(true);
        return;
      }
      setProgram(p);
      setError(false);
      const active = await getActiveProgramState();
      setIsActive(active?.programId === programId);
      navigation.setOptions({ title: p.name });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [programId, navigation]);

  useEffect(() => {
    navigation.setOptions({ headerShown: true, title: 'Program' });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const doStart = async (templateId: number, name: string) => {
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

  const handleStart = (templateId: number, name: string) => {
    if (session) {
      setPendingStart({ templateId, name });
      setConflictOpen(true);
      return;
    }
    void doStart(templateId, name);
  };

  const resumeActive = () => {
    setConflictOpen(false);
    if (session) {
      // Warm the reopen cache so the push lands on content, not a spinner.
      setCachedSession(session);
      router.push(`/session/${session.id}`);
    }
    setPendingStart(null);
  };

  const startNewAndDiscard = async () => {
    setConflictOpen(false);
    if (session) {
      await discardWorkout(session.id);
      clear();
    }
    if (pendingStart) await doStart(pendingStart.templateId, pendingStart.name);
    setPendingStart(null);
  };

  const toggleActive = async () => {
    try {
      if (isActive) {
        await clearActiveProgram();
        setIsActive(false);
        toast({ title: 'Program deactivated', variant: 'info' });
      } else {
        await setActiveProgram(programId);
        setIsActive(true);
        toast({ title: 'Program activated', variant: 'success' });
      }
      impact();
    } catch {
      toast({ title: 'Could not update program', variant: 'destructive' });
    }
  };

  if (loading) return <ListSkeleton count={3} />;
  if (error || !program) return <ErrorState title="Program not found" />;

  const workouts = program.workouts ?? [];
  const weeks = program.weeks ?? 1;
  const grouped: Record<number, ProgramWorkout[]> = {};
  for (const w of workouts) {
    if (!grouped[w.week]) grouped[w.week] = [];
    grouped[w.week].push(w);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ ...SCREEN_CONTENT, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Heading>{program.name}</Heading>
            {program.description ? (
              <Body className="mt-2 text-muted-foreground">{program.description}</Body>
            ) : null}
          </View>
          {program.isCustom ? (
            <Pressable
              onPress={() => router.push(`/program/edit/${programId}` as Href)}
              accessibilityRole="button"
              accessibilityLabel="Edit program"
              className="h-11 w-11 items-center justify-center rounded-xl bg-muted"
              hitSlop={8}>
              <Icon icon={Pencil} size={18} color="muted-foreground" />
            </Pressable>
          ) : null}
        </View>

        <View className="mt-3 flex-row flex-wrap gap-2">
          <Badge variant="outline">{weeks} weeks</Badge>
          <Badge variant="outline">{workouts.length} sessions</Badge>
          {program.isCustom ? <Badge variant="neutral">Custom</Badge> : null}
          {isActive ? <Badge variant="default">Active</Badge> : null}
        </View>

        <View className="mt-5 gap-2">
          <Button
            variant={isActive ? 'tonal' : 'default'}
            leftIcon={isActive ? <Icon icon={Check} size={16} color="primary" /> : undefined}
            onPress={() => void toggleActive()}>
            {isActive ? 'Active program' : 'Use this program'}
          </Button>
          {isActive ? (
            <Caption className="text-center text-muted-foreground">
              Home will highlight today&apos;s session from this plan
            </Caption>
          ) : null}
        </View>

        <View className="mt-6 gap-4">
          {Array.from({ length: weeks }, (_, i) => i + 1).map((week) => (
            <View key={week}>
              <Caption className="mb-2 font-semibold uppercase tracking-wide">Week {week}</Caption>
              <View className="gap-2">
                {(grouped[week] ?? []).length === 0 ? (
                  <Card>
                    <Caption>No sessions scheduled</Caption>
                  </Card>
                ) : (
                  (grouped[week] ?? []).map((pw) => (
                    <Card key={pw.id} className={pw.day === todayDay ? 'border border-primary/30' : undefined}>
                      <View className="flex-row items-center justify-between gap-3">
                        <View className="flex-1">
                          <Body className="font-medium text-foreground">
                            {DAY_LABELS[pw.day - 1] ?? `Day ${pw.day}`} — {pw.templateName ?? 'Workout'}
                          </Body>
                          {pw.estimatedMinutes ? (
                            <Caption className="mt-0.5">{pw.estimatedMinutes} min</Caption>
                          ) : null}
                        </View>
                        {pw.templateId ? (
                          <View className="flex-row gap-2">
                            <Pressable
                              onPress={() => router.push(`/workout/${pw.templateId}`)}
                              className="rounded-lg bg-muted px-3 py-2"
                              accessibilityRole="button"
                              accessibilityLabel="View routine">
                              <Body className="text-xs font-medium text-foreground">View</Body>
                            </Pressable>
                            <Pressable
                              onPress={() => handleStart(pw.templateId, pw.templateName ?? program.name)}
                              disabled={starting}
                              className="h-9 w-9 items-center justify-center rounded-lg bg-primary/10"
                              accessibilityRole="button"
                              accessibilityLabel="Start workout">
                              <Icon icon={Play} size={14} color="primary" />
                            </Pressable>
                          </View>
                        ) : null}
                      </View>
                    </Card>
                  ))
                )}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <ActiveSessionConflictDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        onResume={resumeActive}
        onStartNew={() => void startNewAndDiscard()}
        onCancel={() => setPendingStart(null)}
      />
    </SafeAreaView>
  );
}
