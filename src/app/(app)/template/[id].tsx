import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NestableDraggableFlatList, NestableScrollContainer, ScaleDecorator } from 'react-native-draggable-flatlist';
import { Plus, GripVertical, Trash2 } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Heading, Body, Caption } from '@/components/common/text';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog } from '@/components/ui/dialog';
import { Chip } from '@/components/common/chip';
import { ExercisePickerSheet } from '@/components/workout/exercise-picker-sheet';
import { NumberStepper } from '@/components/workout/number-stepper';
import { useToast } from '@/components/ui/toast';
import {
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  addExerciseToTemplate,
  updateTemplateExercise,
  removeTemplateExercise,
  reorderTemplateExercises,
  linkTemplateExerciseWithNext,
  unlinkTemplateExercise,
} from '@/db/queries';
import { DIFFICULTY_LABELS } from '@/lib/labels';
import { SCREEN_CONTENT_CTA } from '@/lib/layout';
import type { Difficulty, TemplateExercise } from '@/db/types';

type Exercise = TemplateExercise & { exercise?: { id: number; name: string; primaryMuscle: string; equipment: string } };
type ExercisePatch = Partial<Pick<TemplateExercise, 'targetSets' | 'targetRepsMin' | 'targetRepsMax' | 'restSeconds' | 'notes' | 'supersetGroup'>>;

const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

export default function TemplateEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const templateId = isNew ? null : Number(id);
  const router = useRouter();
  const navigation = useNavigation();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate');
  const [estimatedMinutes, setEstimatedMinutes] = useState(45);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    navigation.setOptions({ headerShown: true, title: isNew ? 'New routine' : 'Edit routine' });
  }, [navigation, isNew]);

  useEffect(() => {
    if (!templateId) return;
    getTemplate(templateId).then((t) => {
      if (t) {
        setName(t.name);
        setDescription(t.description);
        setDifficulty(t.difficulty);
        setEstimatedMinutes(t.estimatedMinutes);
        setExercises((t.exercises ?? []) as Exercise[]);
      }
      setLoading(false);
    });
  }, [templateId]);

  const addExercise = async (ex: { id: number; name: string }) => {
    if (!templateId) {
      setExercises((prev) => [
        ...prev,
        {
          id: Date.now(),
          templateId: 0,
          exerciseId: ex.id,
          sortOrder: prev.length,
          targetSets: 3,
          targetRepsMin: 8,
          targetRepsMax: 12,
          restSeconds: 90,
          notes: '',
          supersetGroup: null,
          exercise: { id: ex.id, name: ex.name, primaryMuscle: '', equipment: '', aliases: [], secondaryMuscles: [], movementPattern: '', category: '', instructions: '', tips: '', createdAt: '' },
        } as unknown as Exercise,
      ]);
      return;
    }
    try {
      await addExerciseToTemplate(templateId, ex.id, 3, 8, 12, 90);
      const full = await getTemplate(templateId);
      if (full) setExercises((full.exercises ?? []) as Exercise[]);
    } catch {
      toast({ title: 'Failed to add exercise', variant: 'destructive' });
    }
  };

  const updateExercise = async (te: Exercise, patch: ExercisePatch) => {
    setExercises((prev) => prev.map((e) => (e.id === te.id ? { ...e, ...patch } : e)));
    if (templateId && te.id > 0) {
      await updateTemplateExercise(te.id, patch).catch(() => {});
    }
  };

  const removeExercise = async (te: Exercise) => {
    setExercises((prev) => prev.filter((e) => e.id !== te.id));
    if (templateId && te.id > 0) {
      await removeTemplateExercise(te.id).catch(() => {});
    }
  };

  const save = async () => {
    if (!name.trim()) {
      toast({ title: 'Add a name', variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const newId = await createTemplate(name.trim(), description.trim(), difficulty, estimatedMinutes);
        for (const ex of exercises) {
          const teId = await addExerciseToTemplate(newId, ex.exerciseId, ex.targetSets, ex.targetRepsMin, ex.targetRepsMax, ex.restSeconds);
          if (ex.notes?.trim()) {
            await updateTemplateExercise(teId, { notes: ex.notes });
          }
        }
        toast({ title: 'Routine created', variant: 'success' });
        router.replace(`/workout/${newId}`);
      } else if (templateId) {
        await updateTemplate(templateId, { name: name.trim(), description: description.trim(), difficulty, estimatedMinutes });
        toast({ title: 'Routine saved', variant: 'success' });
        router.back();
      }
    } catch {
      toast({ title: 'Could not save routine', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!templateId) return;
    await deleteTemplate(templateId);
    setDeleteOpen(false);
    toast({ title: 'Routine deleted', variant: 'success' });
    router.replace('/(app)/(tabs)/workouts');
  };

  const openEdit = (te: Exercise) => {
    setEditingExercise(te);
    setEditOpen(true);
  };

  const applyEdit = (patch: ExercisePatch) => {
    if (!editingExercise) return;
    const next = { ...editingExercise, ...patch };
    setEditingExercise(next);
    void updateExercise(editingExercise, patch);
  };

  const onDragEnd = async ({ data }: { data: Exercise[] }) => {
    setExercises(data);
    if (templateId) {
      await reorderTemplateExercises(templateId, data.map((e) => e.id));
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <Caption>Loading...</Caption>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <NestableScrollContainer contentContainerStyle={SCREEN_CONTENT_CTA}>
        <View className="gap-3">
          <View className="gap-1">
            <Label>Name</Label>
            <Input value={name} onChangeText={setName} placeholder="e.g. Push Day" />
          </View>
          <View className="gap-1">
            <Label>Description</Label>
            <Input value={description} onChangeText={setDescription} placeholder="Optional description" />
          </View>
          <View className="gap-1">
            <Label>Difficulty</Label>
            <View className="flex-row gap-2">
              {DIFFICULTIES.map((d) => (
                <Chip key={d} label={DIFFICULTY_LABELS[d]} selected={difficulty === d} onPress={() => setDifficulty(d)} />
              ))}
            </View>
          </View>
          <View className="gap-1">
            <Label>Duration target (minutes)</Label>
            <NumberStepper value={estimatedMinutes} min={15} max={180} step={5} onChange={setEstimatedMinutes} />
          </View>
        </View>

        <Separator className="my-5" />

        <View className="flex-row items-center justify-between">
          <Heading className="text-base">Exercises ({exercises.length})</Heading>
          <Button size="sm" variant="outline" leftIcon={<Icon icon={Plus} size={14} color="primary" />} onPress={() => setPickerOpen(true)}>
            Add
          </Button>
        </View>

        <View className="mt-3">
          <NestableDraggableFlatList
            data={exercises}
            keyExtractor={(item) => `${item.id}`}
            onDragEnd={onDragEnd}
            renderItem={({ item: te, drag, isActive }) => (
              <ScaleDecorator>
                <Pressable onPress={() => openEdit(te)} onLongPress={drag} disabled={isActive}>
                  <Card className={`mb-2 flex-row items-center gap-3 p-3 ${isActive ? 'opacity-80' : ''}`}>
                    <Icon icon={GripVertical} size={16} color="muted-foreground" />
                    <View className="flex-1">
                      <Body className="font-medium text-foreground">{te.exercise?.name ?? 'Exercise'}</Body>
                      <Caption>
                        {te.targetSets} × {te.targetRepsMin}–{te.targetRepsMax} reps · {te.restSeconds}s rest
                        {te.supersetGroup != null ? ' · Superset' : ''}
                      </Caption>
                      {te.notes?.trim() ? (
                        <Caption className="mt-0.5" numberOfLines={1}>{te.notes.trim()}</Caption>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); removeExercise(te); }}
                      hitSlop={8}
                      className="p-1">
                      <Icon icon={Trash2} size={16} color="destructive" />
                    </Pressable>
                  </Card>
                </Pressable>
              </ScaleDecorator>
            )}
            ListEmptyComponent={
              <View className="items-center py-10">
                <Caption className="text-center">No exercises yet. Tap Add to build your routine.</Caption>
              </View>
            }
          />
        </View>
      </NestableScrollContainer>

      <View className="absolute inset-x-0 bottom-0 border-t border-border bg-background p-5 pb-8">
        <Button size="lg" onPress={save} disabled={saving}>
          {saving ? 'Saving...' : isNew ? 'Create routine' : 'Save changes'}
        </Button>
        {!isNew && (
          <Button variant="destructiveTonal" className="mt-2" onPress={() => setDeleteOpen(true)}>
            Delete routine
          </Button>
        )}
      </View>

      <ExercisePickerSheet open={pickerOpen} onOpenChange={setPickerOpen} onPick={addExercise} />

      <Dialog open={editOpen} onOpenChange={setEditOpen} title={editingExercise?.exercise?.name ?? 'Edit exercise'}
        footer={<Button onPress={() => setEditOpen(false)}>Done</Button>}>
        {editingExercise && (
          <View className="gap-4 py-2">
            <View className="flex-row items-center justify-between">
              <Body>Sets</Body>
              <NumberStepper value={editingExercise.targetSets} onChange={(v) => applyEdit({ targetSets: v })} step={1} min={1} max={20} />
            </View>
            <View className="flex-row items-center justify-between">
              <Body>Min reps</Body>
              <NumberStepper value={editingExercise.targetRepsMin} onChange={(v) => applyEdit({ targetRepsMin: v })} step={1} min={1} max={50} />
            </View>
            <View className="flex-row items-center justify-between">
              <Body>Max reps</Body>
              <NumberStepper value={editingExercise.targetRepsMax} onChange={(v) => applyEdit({ targetRepsMax: v })} step={1} min={1} max={50} />
            </View>
            <View className="flex-row items-center justify-between">
              <Body>Rest (sec)</Body>
              <NumberStepper value={editingExercise.restSeconds} onChange={(v) => applyEdit({ restSeconds: v })} step={15} min={0} max={600} />
            </View>
            <View className="gap-1">
              <Body>Notes</Body>
              <Input
                value={editingExercise.notes ?? ''}
                onChangeText={(notes) => applyEdit({ notes })}
                placeholder="Cues, tempo, substitutions…"
                multiline
              />
            </View>
            {!isNew && templateId ? (
              <View className="mt-2 flex-row gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onPress={async () => {
                    await linkTemplateExerciseWithNext(editingExercise.id);
                    const t = await getTemplate(templateId);
                    if (t) setExercises((t.exercises ?? []) as Exercise[]);
                    toast({ title: 'Linked with next exercise', variant: 'success' });
                  }}>
                  Link with next
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onPress={async () => {
                    await unlinkTemplateExercise(editingExercise.id);
                    applyEdit({ supersetGroup: null });
                    toast({ title: 'Removed from superset', variant: 'success' });
                  }}>
                  Unlink
                </Button>
              </View>
            ) : null}
          </View>
        )}
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete routine?"
        description="This cannot be undone."
        footer={
          <>
            <Button variant="outline" onPress={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onPress={handleDelete}>Delete</Button>
          </>
        }
      />
    </SafeAreaView>
  );
}
