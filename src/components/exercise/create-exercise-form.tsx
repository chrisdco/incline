import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { cn } from '@/lib/cn';
import { Caption, Body, Text } from '@/components/common/text';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/common/chip';
import { createCustomExercise, type CreateCustomExerciseInput } from '@/db/queries';
import type { MuscleGroup, MovementPattern, Equipment, Category } from '@/db/types';

const MUSCLES: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'forearms', 'traps'];
const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'bodyweight', 'band', 'other'];
const PATTERNS: MovementPattern[] = ['horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'squat_hinge', 'isolation', 'carry', 'core'];
const CATEGORIES: Category[] = ['strength', 'cardio', 'mobility', 'accessory'];

function label(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CreateExerciseForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [primaryMuscle, setPrimaryMuscle] = useState<MuscleGroup>('chest');
  const [equipment, setEquipment] = useState<Equipment>('barbell');
  const [pattern, setPattern] = useState<MovementPattern>('horizontal_push');
  const [category, setCategory] = useState<Category>('strength');
  const [isCompound, setIsCompound] = useState(false);
  const [tips, setTips] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim()) {
      setError('Exercise name is required');
      return;
    }
    setSaving(true);
    setError('');
    // Computed outside the try: the compiler can't lower conditionals inside one.
    const input: CreateCustomExerciseInput = {
      name: name.trim(),
      primaryMuscle,
      movementPattern: pattern,
      equipment,
      category,
      isCompound,
      tips: tips.trim() || undefined,
    };
    try {
      await createCustomExercise(input);
      onCreated();
    } catch {
      setError('Failed to save exercise');
    }
    setSaving(false);
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View className="gap-4">
        <View className="gap-1.5">
          <Caption>Exercise name</Caption>
          <Input value={name} onChangeText={(t) => { setName(t); setError(''); }} placeholder="e.g. Seated Leg Curl" />
          {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
        </View>

        <View className="gap-1.5">
          <Caption>Primary muscle</Caption>
          <View className="flex-row flex-wrap gap-1.5">
            {MUSCLES.map((m) => (
              <Chip key={m} label={label(m)} selected={primaryMuscle === m} onPress={() => setPrimaryMuscle(m)} size="sm" />
            ))}
          </View>
        </View>

        <View className="gap-1.5">
          <Caption>Equipment</Caption>
          <View className="flex-row flex-wrap gap-1.5">
            {EQUIPMENT.map((e) => (
              <Chip key={e} label={label(e)} selected={equipment === e} onPress={() => setEquipment(e)} size="sm" />
            ))}
          </View>
        </View>

        <View className="gap-1.5">
          <Caption>Movement pattern</Caption>
          <View className="flex-row flex-wrap gap-1.5">
            {PATTERNS.map((p) => (
              <Chip key={p} label={label(p)} selected={pattern === p} onPress={() => setPattern(p)} size="sm" />
            ))}
          </View>
        </View>

        <View className="gap-1.5">
          <Caption>Category</Caption>
          <View className="flex-row flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <Chip key={c} label={label(c)} selected={category === c} onPress={() => setCategory(c)} size="sm" />
            ))}
          </View>
        </View>

        <Pressable
          onPress={() => setIsCompound(!isCompound)}
          className="flex-row items-center gap-2 rounded-xl bg-card px-4 py-3">
          <View className={cn('h-5 w-5 items-center justify-center rounded border-2', isCompound ? 'border-primary bg-primary' : 'border-border')}>
            {isCompound ? <Body className="text-2xs text-primary-foreground">✓</Body> : null}
          </View>
          <Body className="text-sm text-foreground">Compound movement</Body>
        </Pressable>

        <View className="gap-1.5">
          <Caption>Tips (optional)</Caption>
          <Input value={tips} onChangeText={setTips} placeholder="Form cues, common mistakes..." multiline />
        </View>
      </View>

      <View className="mt-6 flex-row gap-3">
        <Button variant="outline" className="flex-1" onPress={onCancel}>Cancel</Button>
        <Button className="flex-1" onPress={save} disabled={saving}>
          {saving ? 'Saving…' : 'Create exercise'}
        </Button>
      </View>
    </ScrollView>
  );
}
