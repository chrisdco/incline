import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { ChevronDown, ChevronLeft, ChevronUp, GripVertical } from 'lucide-react-native';

import { Body, Caption, Heading } from '@/components/common/text';
import { Icon } from '@/components/common/icon';
import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/common/skeleton';
import { useHaptics } from '@/hooks/use-haptics';
import { useToast } from '@/components/ui/toast';
import { getWorkoutLog, reorderWorkoutExercises } from '@/db/queries';

interface ReorderItem {
  exerciseId: number;
  name: string;
  setCount: number;
}

/**
 * Reorder the exercises of a live session. Drag to arrange, Done persists —
 * saved for this session only (display-local `sort_order`, never synced).
 */
export default function ReorderSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const logId = Number(id);
  const router = useRouter();
  const { toast } = useToast();
  const { impact } = useHaptics();
  const [items, setItems] = useState<ReorderItem[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (Number.isNaN(logId)) {
        if (active) setItems([]);
        return;
      }
      try {
        const session = await getWorkoutLog(logId);
        if (!active) return;
        const seen = new Map<number, ReorderItem>();
        for (const s of session?.sets ?? []) {
          const cur = seen.get(s.exerciseId);
          if (cur) cur.setCount += 1;
          else seen.set(s.exerciseId, { exerciseId: s.exerciseId, name: s.exerciseName, setCount: 1 });
        }
        setItems([...seen.values()]);
      } catch {
        if (!active) return;
        toast({ title: 'Could not load exercises', variant: 'destructive' });
        router.back();
      }
    })();
    return () => {
      active = false;
    };
  }, [logId, router, toast]);

  const move = useCallback((exerciseId: number, delta: -1 | 1) => {
    setItems((prev) => {
      if (!prev) return prev;
      const i = prev.findIndex((x) => x.exerciseId === exerciseId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      impact();
      const next = [...prev];
      const [item] = next.splice(i, 1);
      next.splice(j, 0, item);
      return next;
    });
  }, [impact]);

  const onDone = useCallback(async () => {
    if (items == null || saving || Number.isNaN(logId)) return;
    setSaving(true);
    try {
      await reorderWorkoutExercises(
        logId,
        items.map((i) => i.exerciseId),
      );
      router.back();
    } catch {
      toast({ title: 'Could not save order', variant: 'destructive' });
      setSaving(false);
    }
  }, [items, saving, logId, router, toast]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-3">
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to workout without saving"
          className="p-1">
          <Icon icon={ChevronLeft} size={24} color="foreground" />
        </Pressable>
        <View className="flex-1">
          <Heading className="text-lg">Reorder exercises</Heading>
          <Caption>Drag to arrange · saved for this session</Caption>
        </View>
      </View>

      {items == null ? (
        <View className="flex-1 px-4">
          <ListSkeleton count={4} />
        </View>
      ) : (
        <View className="flex-1 px-4">
          <DraggableFlatList
            data={items}
            keyExtractor={(item) => `${item.exerciseId}`}
            onDragEnd={({ data }) => {
              impact();
              setItems(data);
            }}
            contentContainerStyle={{ paddingBottom: 120 }}
            renderItem={({ item, drag, isActive }) => (
              <ScaleDecorator>
                <Pressable
                  onLongPress={drag}
                  disabled={isActive}
                  delayLongPress={150}
                  accessibilityRole="button"
                  accessibilityLabel={`Drag ${item.name} to reorder`}
                  className={`mb-2 flex-row items-center gap-3 rounded-2xl bg-card p-4 ${isActive ? 'opacity-80' : ''}`}>
                  <Icon icon={GripVertical} size={18} color="muted-foreground" />
                  <View className="flex-1">
                    <Body className="font-medium text-foreground" numberOfLines={1}>
                      {item.name}
                    </Body>
                    <Caption>
                      {item.setCount} set{item.setCount === 1 ? '' : 's'}
                    </Caption>
                  </View>
                  {/* Non-drag alternative: same reorder, screen-reader usable. */}
                  <Pressable
                    onPress={() => move(item.exerciseId, -1)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${item.name} up`}
                    className="p-2">
                    <Icon icon={ChevronUp} size={18} color="muted-foreground" />
                  </Pressable>
                  <Pressable
                    onPress={() => move(item.exerciseId, 1)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${item.name} down`}
                    className="p-2">
                    <Icon icon={ChevronDown} size={18} color="muted-foreground" />
                  </Pressable>
                </Pressable>
              </ScaleDecorator>
            )}
          />
        </View>
      )}

      <View className="absolute inset-x-0 bottom-0 border-t border-border bg-background px-5 pb-8 pt-4">
        <Button size="lg" onPress={() => { void onDone(); }} loading={saving}>
          Done
        </Button>
      </View>
    </SafeAreaView>
  );
}
