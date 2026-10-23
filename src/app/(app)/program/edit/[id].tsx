import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Trash2, Copy } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Body, Caption } from '@/components/common/text';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { Sheet } from '@/components/ui/sheet';
import { Chip } from '@/components/common/chip';
import { useToast } from '@/components/ui/toast';
import { useHaptics } from '@/hooks/use-haptics';
import {
  getProgram,
  createProgram,
  updateProgram,
  deleteProgram,
  setProgramDay,
  clearProgramDay,
  applyWeek1ToAllWeeks,
  listTemplateSummaries,
} from '@/db/queries';
import { SCREEN_CONTENT_CTA } from '@/lib/layout';
import { refreshWidgets } from '@/lib/widgets/refresh';
import type { ProgramWorkout } from '@/db/types';
import type { TemplateSummary } from '@/db/queries';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEK_OPTIONS = [1, 2, 3, 4, 6, 8, 12];

export default function ProgramEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const programIdParam = isNew ? null : Number(id);
  const navigation = useNavigation();
  const router = useRouter();
  const { toast } = useToast();
  const { impact } = useHaptics();

  const [programId, setProgramId] = useState<number | null>(programIdParam);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [workouts, setWorkouts] = useState<ProgramWorkout[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [slotPicker, setSlotPicker] = useState<{ week: number; day: number } | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [editWeek, setEditWeek] = useState(1);

  useEffect(() => {
    navigation.setOptions({ headerShown: true, title: isNew ? 'New program' : 'Edit program' });
  }, [navigation, isNew]);

  const reload = useCallback(async (idToLoad: number) => {
    const p = await getProgram(idToLoad);
    if (!p || !p.isCustom) {
      toast({ title: 'Program not found', variant: 'destructive' });
      router.back();
      return;
    }
    setName(p.name);
    setDescription(p.description);
    setWeeks(p.weeks);
    setWorkouts(p.workouts ?? []);
    setLoading(false);
  }, [router, toast]);

  useEffect(() => {
    void listTemplateSummaries().then(setTemplates);
  }, []);

  useEffect(() => {
    if (programIdParam) void reload(programIdParam);
  }, [programIdParam, reload]);

  const ensureProgram = async (): Promise<number | null> => {
    if (programId) {
      await updateProgram(programId, { name, description, weeks });
      return programId;
    }
    const idCreated = await createProgram(name, description, weeks);
    setProgramId(idCreated);
    return idCreated;
  };

  const saveMeta = async () => {
    setSaving(true);
    try {
      const idSaved = await ensureProgram();
      if (!idSaved) return;
      void refreshWidgets();
      impact();
      toast({ title: 'Program saved', variant: 'success' });
      if (isNew) {
        router.replace(`/program/edit/${idSaved}`);
      } else {
        await reload(idSaved);
      }
    } catch {
      toast({ title: 'Could not save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const assignSlot = async (templateId: number) => {
    if (!slotPicker) return;
    setSaving(true);
    try {
      const idSaved = await ensureProgram();
      if (!idSaved) return;
      await setProgramDay(idSaved, slotPicker.week, slotPicker.day, templateId);
      void refreshWidgets();
      await reload(idSaved);
      setSlotPicker(null);
      impact();
    } catch {
      toast({ title: 'Could not assign routine', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const clearSlot = async (week: number, day: number) => {
    if (!programId) return;
    try {
      await clearProgramDay(programId, week, day);
      void refreshWidgets();
      await reload(programId);
      impact();
    } catch {
      toast({ title: 'Could not clear day', variant: 'destructive' });
    }
  };

  const copyWeek1 = async () => {
    if (!programId) {
      toast({ title: 'Save the program first', variant: 'info' });
      return;
    }
    try {
      await applyWeek1ToAllWeeks(programId);
      void refreshWidgets();
      await reload(programId);
      toast({ title: 'Week 1 applied to all weeks', variant: 'success' });
      impact();
    } catch {
      toast({ title: 'Could not apply week 1', variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!programId) return;
    try {
      await deleteProgram(programId);
      void refreshWidgets();
      toast({ title: 'Program deleted', variant: 'info' });
      router.replace('/(app)/(tabs)/workouts');
    } catch {
      toast({ title: 'Could not delete', variant: 'destructive' });
    } finally {
      setDeleteOpen(false);
    }
  };

  const slotFor = (week: number, day: number) =>
    workouts.find((w) => w.week === week && w.day === day) ?? null;

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
        <View className="flex-1 items-center justify-center">
          <Caption>Loading…</Caption>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={SCREEN_CONTENT_CTA} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View className="gap-4">
          <View>
            <Label>Name</Label>
            <Input value={name} onChangeText={setName} placeholder="e.g. Strength block" className="mt-1.5" />
          </View>
          <View>
            <Label>Description</Label>
            <Input
              value={description}
              onChangeText={setDescription}
              placeholder="Optional notes"
              className="mt-1.5"
            />
          </View>
          <View>
            <Label>Weeks</Label>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {WEEK_OPTIONS.map((w) => (
                <Chip key={w} label={`${w}`} selected={weeks === w} onPress={() => setWeeks(w)} />
              ))}
            </View>
          </View>

          <View className="mt-2">
            <View className="mb-2 flex-row items-center justify-between">
              <Caption className="font-semibold uppercase tracking-wide">Schedule</Caption>
              {programId && weeks > 1 ? (
                <Pressable onPress={() => void copyWeek1()} className="flex-row items-center gap-1.5 py-1" hitSlop={8}>
                  <Icon icon={Copy} size={14} color="muted-foreground" />
                  <Caption>Apply week 1 to all</Caption>
                </Pressable>
              ) : null}
            </View>
            <View className="mb-3 flex-row flex-wrap gap-2">
              {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
                <Chip key={w} label={`W${w}`} selected={editWeek === w} onPress={() => setEditWeek(w)} size="sm" />
              ))}
            </View>

            <View className="gap-2">
              {DAY_LABELS.map((label, idx) => {
                const day = idx + 1;
                const slot = slotFor(editWeek, day);
                return (
                  <Card key={day}>
                    <View className="flex-row items-center gap-3">
                      <View className="w-10">
                        <Body className="font-medium text-foreground">{label}</Body>
                      </View>
                      <Pressable
                        className="min-h-[44px] flex-1 justify-center"
                        onPress={() => setSlotPicker({ week: editWeek, day })}
                        accessibilityRole="button"
                        accessibilityLabel={`Assign routine for ${label}`}>
                        {slot ? (
                          <Body className="font-medium text-foreground">{slot.templateName}</Body>
                        ) : (
                          <Caption>Rest / tap to assign</Caption>
                        )}
                      </Pressable>
                      {slot ? (
                        <Pressable
                          onPress={() => void clearSlot(editWeek, day)}
                          accessibilityLabel="Clear day"
                          className="h-10 w-10 items-center justify-center"
                          hitSlop={8}>
                          <Icon icon={Trash2} size={16} color="muted-foreground" />
                        </Pressable>
                      ) : (
                        <Pressable
                          onPress={() => setSlotPicker({ week: editWeek, day })}
                          className="h-10 w-10 items-center justify-center"
                          hitSlop={8}>
                          <Icon icon={Plus} size={16} color="muted-foreground" />
                        </Pressable>
                      )}
                    </View>
                  </Card>
                );
              })}
            </View>
          </View>

          <Button onPress={() => void saveMeta()} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save program'}
          </Button>

          {programId ? (
            <Button variant="destructiveTonal" onPress={() => setDeleteOpen(true)}>
              Delete program
            </Button>
          ) : null}
        </View>
      </ScrollView>

      <Sheet open={!!slotPicker} onOpenChange={(open) => !open && setSlotPicker(null)} mode="expandable">
        <Caption className="mb-3 font-semibold uppercase tracking-wide">Choose routine</Caption>
        <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
          <View className="gap-2 pb-4">
            {templates.length === 0 ? (
              <Caption>No routines yet. Create one under Workouts → Routines.</Caption>
            ) : (
              templates.map((t) => (
                <Pressable
                  key={t.template.id}
                  onPress={() => void assignSlot(t.template.id)}
                  className="rounded-2xl bg-muted px-4 py-3"
                  accessibilityRole="button">
                  <Body className="font-medium text-foreground">{t.template.name}</Body>
                  <Caption className="mt-0.5">{t.exerciseCount} exercises</Caption>
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>
      </Sheet>

      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete program?"
        description="This cannot be undone. Your routines stay intact."
        footer={
          <>
            <Button variant="outline" onPress={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onPress={() => void confirmDelete()}>Delete</Button>
          </>
        }
      />
    </SafeAreaView>
  );
}
