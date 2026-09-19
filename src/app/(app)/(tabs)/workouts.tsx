import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Dumbbell, Plus, Search, ClipboardList, Play, Pencil, Trash2, Copy } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Heading, Body } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Sheet } from '@/components/ui/sheet';
import { SegmentedControl } from '@/components/common/segmented-control';
import { EmptyState, ErrorState } from '@/components/common/states';
import { ListSkeleton } from '@/components/common/skeleton';
import { WorkoutCard } from '@/components/workout/workout-card';
import { ProgramCard } from '@/components/workout/program-card';
import { ActiveSessionConflictDialog } from '@/components/workout/active-session-conflict-dialog';
import { useTemplateSummaries, usePrograms } from '@/hooks/use-data';
import { useActiveSession } from '@/hooks/use-active-session';
import { useActiveWorkout } from '@/store/active-workout-store';
import { useToast } from '@/components/ui/toast';
import { useHaptics } from '@/hooks/use-haptics';
import { startWorkout, discardWorkout, deleteTemplate, duplicateTemplate } from '@/db/queries';
import { setCachedSession } from '@/db/session-cache';
import type { TemplateSummary } from '@/db/queries';
import { SCREEN_CONTENT, SCREEN_HEADER } from '@/lib/layout';

type Tab = 'routines' | 'programs';

export default function WorkoutsScreen() {
  const [tab, setTab] = useState<Tab>('routines');
  const router = useRouter();
  const templates = useTemplateSummaries();
  const programs = usePrograms();
  const { session } = useActiveSession();
  const clear = useActiveWorkout((s) => s.clear);
  const { toast } = useToast();
  const { impact } = useHaptics();
  const [starting, setStarting] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<{ templateId: number | null; name: string } | null>(null);
  const [menuTarget, setMenuTarget] = useState<TemplateSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TemplateSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleStart = (templateId: number | null, name: string) => {
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
    if (pendingStart) {
      await doStart(pendingStart.templateId, pendingStart.name);
    }
    setPendingStart(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTemplate(deleteTarget.template.id);
      impact();
      toast({ title: 'Routine deleted', variant: 'info' });
      templates.refetch();
    } catch {
      toast({ title: 'Could not delete routine', variant: 'destructive' });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
      setMenuTarget(null);
    }
  };

  const handleDuplicate = async () => {
    if (!menuTarget) return;
    const source = menuTarget;
    setMenuTarget(null);
    try {
      const newId = await duplicateTemplate(source.template.id);
      impact();
      toast({ title: 'Routine duplicated', variant: 'success' });
      templates.refetch();
      router.push({ pathname: '/(app)/template/[id]', params: { id: String(newId) } } as Href);
    } catch {
      toast({ title: 'Could not duplicate routine', variant: 'destructive' });
    }
  };

  const openNewRoutine = () => router.push({ pathname: '/(app)/template/[id]', params: { id: 'new' } } as Href);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className={SCREEN_HEADER}>
        <Heading>Workouts</Heading>
        <SegmentedControl<Tab>
          className="mt-3"
          value={tab}
          onChange={setTab}
          values={[
            { value: 'routines', label: 'Routines' },
            { value: 'programs', label: 'Programs' },
          ]}
        />
      </View>

      {tab === 'routines' ? (
        <FlashList
          data={templates.data ?? []}
          renderItem={({ item }) => (
            <WorkoutCard
              id={item.template.id}
              name={item.template.name}
              description={item.template.description}
              difficulty={item.template.difficulty}
              estimatedMinutes={item.template.estimatedMinutes}
              exerciseCount={item.exerciseCount}
              muscleFocus={item.muscleFocus}
              onStart={() => handleStart(item.template.id, item.template.name)}
              onMenuPress={() => setMenuTarget(item)}
            />
          )}
          keyExtractor={(item) => String(item.template.id)}
          contentContainerStyle={SCREEN_CONTENT}
          ItemSeparatorComponent={() => <View className="h-3" />}
          ListHeaderComponent={
            <View className="mb-4 gap-3">
              <Button
                leftIcon={<Icon icon={Play} size={18} color="primary-foreground" />}
                onPress={() => handleStart(null, 'Empty Workout')}
                disabled={starting}>
                Start Empty Workout
              </Button>

              <View className="mt-2 flex-row items-center justify-between">
                <Body className="font-semibold text-foreground">Routines</Body>
                <Pressable onPress={openNewRoutine} hitSlop={8}>
                  <Icon icon={Plus} size={22} color="primary" />
                </Pressable>
              </View>

              <View className="flex-row gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  leftIcon={<Icon icon={ClipboardList} size={16} color="primary" />}
                  onPress={openNewRoutine}>
                  New Routine
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  leftIcon={<Icon icon={Search} size={16} color="primary" />}
                  onPress={() => router.push('/(app)/exercises')}>
                  Explore
                </Button>
              </View>
            </View>
          }
          ListEmptyComponent={
            templates.loading ? (
              <ListSkeleton count={3} />
            ) : templates.error ? (
              <ErrorState onRetry={templates.refetch} />
            ) : (
              <EmptyState icon={<Icon icon={Dumbbell} size={28} color="muted-foreground" />} title="No routines yet" description="Create your first workout routine." actionLabel="Create" onAction={openNewRoutine} />
            )
          }
        />
      ) : null}

      {tab === 'programs' ? (
        <FlashList
          data={programs.data ?? []}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push({ pathname: '/(app)/program/[id]', params: { id: String(item.id) } } as Href)}>
              <ProgramCard program={item} />
            </Pressable>
          )}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={SCREEN_CONTENT}
          ItemSeparatorComponent={() => <View className="h-3" />}
          ListHeaderComponent={
            <View className="mb-4 flex-row items-center justify-between">
              <Body className="font-semibold text-foreground">Programs</Body>
              <Pressable
                onPress={() => router.push('/program/edit/new' as Href)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="New program">
                <Icon icon={Plus} size={22} color="primary" />
              </Pressable>
            </View>
          }
          ListEmptyComponent={
            programs.loading ? (
              <ListSkeleton count={2} />
            ) : (
              <EmptyState
                title="No programs yet"
                description="Build a multi-week plan from your routines."
                actionLabel="New program"
                onAction={() => router.push('/program/edit/new' as Href)}
              />
            )
          }
        />
      ) : null}

      <Sheet
        open={menuTarget !== null}
        onOpenChange={(open) => { if (!open) setMenuTarget(null); }}
        title={menuTarget?.template.name ?? ''}
        mode="fit">
        <View className="gap-1">
          <Pressable
            onPress={() => {
              if (menuTarget) handleStart(menuTarget.template.id, menuTarget.template.name);
              setMenuTarget(null);
            }}
            className="flex-row items-center gap-3 rounded-xl p-3"
            android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
            <Icon icon={Play} size={18} color="primary" />
            <Body className="text-foreground">Start Routine</Body>
          </Pressable>
          <Pressable
            onPress={() => {
              if (menuTarget) router.push({ pathname: '/(app)/template/[id]', params: { id: String(menuTarget.template.id) } } as Href);
              setMenuTarget(null);
            }}
            className="flex-row items-center gap-3 rounded-xl p-3"
            android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
            <Icon icon={Pencil} size={18} color="muted-foreground" />
            <Body className="text-foreground">Edit Routine</Body>
          </Pressable>
          <Pressable
            onPress={handleDuplicate}
            className="flex-row items-center gap-3 rounded-xl p-3"
            android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
            <Icon icon={Copy} size={18} color="muted-foreground" />
            <Body className="text-foreground">Duplicate Routine</Body>
          </Pressable>
          <Pressable
            onPress={() => {
              setDeleteTarget(menuTarget);
              setMenuTarget(null);
            }}
            className="flex-row items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3"
            android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
            <Icon icon={Trash2} size={18} color="destructive" />
            <Body className="text-destructive">Delete Routine</Body>
          </Pressable>
        </View>
      </Sheet>

      <ActiveSessionConflictDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        onResume={resumeActive}
        onStartNew={startNewAndDiscard}
        onCancel={() => setPendingStart(null)}
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete routine?"
        description={`"${deleteTarget?.template.name ?? ''}" will be permanently deleted.`}
        footer={
          <>
            <Button variant="outline" onPress={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onPress={confirmDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      />
    </SafeAreaView>
  );
}
