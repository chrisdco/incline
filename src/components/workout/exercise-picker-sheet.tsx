import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { Pressable, View } from 'react-native';
import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';
import { FlashList } from '@shopify/flash-list';
import { Plus, Trash2 } from 'lucide-react-native';

import { Sheet } from '@/components/ui/sheet';
import { SearchBar } from '@/components/common/search-bar';
import { CreateExerciseForm } from '@/components/exercise/create-exercise-form';
import { MuscleBadge } from '@/components/exercise/muscle-badge';
import { EmptyState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/common/icon';
import { Text } from '@/components/ui/text';
import { fetchExercisesFromSupabase, searchExercisesFromSupabase, type SupabaseExercise } from '@/lib/supabase';
import { ensureExerciseExists, getExercise, listCustomExercises, deleteCustomExercise, getCustomExerciseUsage, listExercises, searchExercises } from '@/db/queries';
import type { Exercise } from '@/db/types';

/** Convert a Supabase exercise to the local Exercise type for workout logging. */
function toLocalExercise(ex: SupabaseExercise): Exercise {
  return {
    id: 0, // will be set by ensureExerciseExists
    name: ex.name,
    aliases: [],
    primaryMuscle: ex.target_muscle as Exercise['primaryMuscle'],
    secondaryMuscles: (ex.secondary_muscles ?? []) as Exercise['secondaryMuscles'],
    movementPattern: ex.movement_pattern as Exercise['movementPattern'],
    equipment: ex.equipment as Exercise['equipment'],
    category: ex.category as Exercise['category'],
    isCompound: ex.is_compound,
    isCustom: false,
    source: 'exercisedb',
    externalId: ex.external_id,
    difficulty: ex.difficulty,
    defaultRestSeconds: 90,
    instructions: ex.instructions ?? [],
    tips: '',
    imageUrl: ex.gif_url ?? null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Convert a local SQLite exercise into the picker's list shape. */
function toSupabaseItem(ex: Exercise): SupabaseExercise {
  return {
    id: ex.id,
    external_id: ex.externalId ?? `local:${ex.id}`,
    name: ex.name,
    body_part: ex.primaryMuscle,
    equipment: ex.equipment,
    target_muscle: ex.primaryMuscle,
    secondary_muscles: ex.secondaryMuscles,
    movement_pattern: ex.movementPattern ?? 'isolation',
    category: ex.category,
    is_compound: ex.isCompound,
    difficulty: ex.difficulty ?? 'intermediate',
    instructions: ex.instructions,
    gif_url: ex.imageUrl ?? '',
    created_at: new Date(ex.createdAt).toISOString(),
    is_custom: ex.isCustom,
  };
}

/** Module scope: a new component identity per render breaks FlashList recycling. */
function PickerSeparator() {
  return <View className="h-2" />;
}

/** Memoized row: search keystrokes re-render the list, not every visible row. */
const PickerRow = memo(function PickerRow({
  externalId,
  name,
  isCustom,
  canDelete,
  targetMuscle,
  equipment,
  onPick,
  onDelete,
}: {
  externalId: string;
  name: string;
  isCustom: boolean;
  canDelete: boolean;
  targetMuscle: string;
  equipment: string;
  onPick: (externalId: string) => void;
  onDelete: (externalId: string) => void;
}) {
  return (
    <Pressable onPress={() => onPick(externalId)}>
      <View className="mb-2">
        <View className="flex-row items-center gap-3 rounded-3xl bg-card p-4">
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-sm font-semibold text-foreground">{name}</Text>
              {isCustom ? (
                <View className="rounded-full bg-primary/15 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold text-primary">Custom</Text>
                </View>
              ) : null}
            </View>
            <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
              <MuscleBadge muscle={targetMuscle} />
              <Text className="text-xs text-muted-foreground">{equipment}</Text>
            </View>
          </View>
          {canDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${name}`}
              onPress={() => onDelete(externalId)}
              hitSlop={8}
              className="p-2">
              <Icon icon={Trash2} size={16} color="muted-foreground" />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});


/** Modal sheet to pick an exercise — fetches from Supabase (ExerciseDB data). */
export function ExercisePickerSheet({
  open,
  onOpenChange,
  onPick,
  pinned,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (exercise: Exercise) => void;
  pinned?: Exercise[];
  title?: string;
}) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [items, setItems] = useState<SupabaseExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  // Local id → usage count for custom exercises (0 = safe to delete).
  const [usageMap, setUsageMap] = useState<Record<number, number>>({});
  const BATCH = 50;

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchExercisesFromSupabase(BATCH, 0);
      const customs = (await listCustomExercises()).map(toSupabaseItem);
      const usage: Record<number, number> = {};
      await Promise.all(customs.map(async (c) => { usage[c.id] = await getCustomExerciseUsage(c.id); }));
      setUsageMap(usage);
      setItems([...customs, ...data]);
      setOffset(data.length);
      setHasMore(data.length === BATCH);
    } catch {
      // Supabase unreachable — fall back to local SQLite exercises
      try {
        const local = await listExercises();
        const usage: Record<number, number> = {};
        await Promise.all(local.map(async (ex) => { if (ex.isCustom) usage[ex.id] = await getCustomExerciseUsage(ex.id); }));
        setUsageMap(usage);
        setItems(local.map(toSupabaseItem));
        setHasMore(false);
      } catch {
        setError('Could not load exercises. Check your connection.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const data = await fetchExercisesFromSupabase(BATCH, offset);
      setItems((prev) => [...prev, ...data]);
      setOffset((prev) => prev + data.length);
      setHasMore(data.length === BATCH);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [loading, hasMore, offset]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      loadInitial();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await searchExercisesFromSupabase(q);
      // Local custom exercises always participate in search.
      const customs = (await searchExercises(q))
        .filter((h) => h.exercise.isCustom)
        .map((h) => toSupabaseItem(h.exercise));
      const customNames = new Set(customs.map((c) => c.name.toLowerCase()));
      setItems([...customs, ...data.filter((d) => !customNames.has(d.name.toLowerCase()))]);
      setHasMore(false);
    } catch {
      // Supabase unreachable — search local SQLite
      try {
        const local = await searchExercises(q);
        setItems(local.map((hit) => toSupabaseItem(hit.exercise)));
        setHasMore(false);
      } catch {
        setError('Search failed. Try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [loadInitial]);

  // Load initial data when sheet opens
  useEffect(() => {
    if (open && !creating) {
      const t = setTimeout(() => loadInitial(), 0);
      return () => clearTimeout(t);
    }
  }, [open, creating, loadInitial]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const handlePick = async (ex: SupabaseExercise) => {
    if (ex.is_custom) {
      // Already a local row — use it directly, no ensure/insert round-trip.
      const local = await getExercise(ex.id);
      if (local) {
        onPick(local);
        onOpenChange(false);
        setQuery('');
      }
      return;
    }
    // Save to local SQLite so workout logging works
    const local = toLocalExercise(ex);
    const localId = await ensureExerciseExists(local, ex.external_id);
    onPick({ ...local, id: localId });
    onOpenChange(false);
    setQuery('');
  };

  const handleDeleteCustom = async (ex: SupabaseExercise) => {
    await deleteCustomExercise(ex.id);
    setQuery('');
    loadInitial();
  };

  const handleCreated = () => {
    setCreating(false);
    loadInitial();
  };

  const displayItems = useMemo(() => {
    if (!pinned?.length || query.trim()) return items;
    const pinnedItems = pinned.map(toSupabaseItem);
    const seen = new Set(pinnedItems.map((p) => p.external_id));
    return [...pinnedItems, ...items.filter((i) => !seen.has(i.external_id))];
  }, [items, pinned, query]);

  // Stable by-id callbacks so memoized rows skip re-renders on keystrokes.
  // Refs sync in an effect: row presses only fire post-render.
  const itemsRef = useRef(displayItems);
  const pickRef = useRef(handlePick);
  const deleteRef = useRef(handleDeleteCustom);
  useEffect(() => {
    itemsRef.current = displayItems;
    pickRef.current = handlePick;
    deleteRef.current = handleDeleteCustom;
  });
  const handlePickById = useCallback((externalId: string) => {
    const item = itemsRef.current.find((x) => x.external_id === externalId);
    if (item) void pickRef.current(item);
  }, []);
  const handleDeleteById = useCallback((externalId: string) => {
    const item = itemsRef.current.find((x) => x.external_id === externalId);
    if (item) void deleteRef.current(item);
  }, []);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={creating ? 'Create exercise' : (title ?? 'Add exercise')}
      mode="expandable"
      // Open at the full detent: at 50% the search + 500px list was cut off
      // with no affordance. User can still drag down to half. Covers both
      // the add-exercise and swap-exercise entries (same sheet).
      initialIndex={1}
      scroll>
      {creating ? (
        <CreateExerciseForm onCreated={handleCreated} onCancel={() => setCreating(false)} />
      ) : (
        <>
          <Button
            variant="outline"
            className="mb-3"
            leftIcon={<Icon icon={Plus} size={16} color="primary" />}
            onPress={() => setCreating(true)}>
            Create custom exercise
          </Button>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search exercises" className="mb-3" />
          <View style={{ minHeight: 300, maxHeight: 500 }}>
            {error ? (
              <EmptyState title="Error" description={error} />
            ) : displayItems.length === 0 && !loading ? (
              <EmptyState title="No exercises found" description="Try a different search or create a custom exercise." />
            ) : (
              <FlashList
                data={displayItems}
                renderItem={({ item }) => (
                  <PickerRow
                    externalId={item.external_id}
                    name={item.name}
                    isCustom={item.is_custom === true}
                    canDelete={item.is_custom === true && usageMap[item.id] === 0}
                    targetMuscle={item.target_muscle}
                    equipment={item.equipment}
                    onPick={handlePickById}
                    onDelete={handleDeleteById}
                  />
                )}
                keyExtractor={(item) => item.external_id}
                ItemSeparatorComponent={PickerSeparator}
                onEndReached={loadMore}
                onEndReachedThreshold={0.3}
                ListFooterComponent={
                  loading ? <PrimaryActivityIndicator className="py-4" /> : null
                }
              />
            )}
          </View>
        </>
      )}
    </Sheet>
  );
}
