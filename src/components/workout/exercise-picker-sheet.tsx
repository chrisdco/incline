import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { Pressable, View } from 'react-native';
import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';
import { FlashList } from '@shopify/flash-list';
import { Plus, Trash2 } from 'lucide-react-native';

import { Sheet } from '@/components/ui/sheet';
import { SearchBar } from '@/components/common/search-bar';
import {
  ExerciseFilterBar,
  hasExerciseFilters,
  type ExerciseFilterValues,
} from '@/components/exercise/exercise-filter-bar';
import { CreateExerciseForm } from '@/components/exercise/create-exercise-form';
import { MuscleBadge } from '@/components/exercise/muscle-badge';
import { EmptyState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/common/icon';
import { Text } from '@/components/ui/text';
import { fetchExercisesFromSupabase, searchExercisesFromSupabase, type SupabaseExercise } from '@/lib/supabase';
import { ensureExerciseExists, getExercise, listCustomExercises, deleteCustomExercise, getCustomExerciseUsage, searchExercises } from '@/db/queries';
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
    <Pressable
      onPress={() => onPick(externalId)}
      style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
      android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: false }}>
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
  const [filters, setFilters] = useState<ExerciseFilterValues>({ muscle: null, equipment: null, pattern: null });
  const [creating, setCreating] = useState(false);
  const [items, setItems] = useState<SupabaseExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  // True only when the local catalog is genuinely empty (pre-seed states):
  // the only mode that still paginates Supabase.
  const [cloudOnly, setCloudOnly] = useState(false);
  // Local id → usage count for custom exercises (0 = safe to delete).
  const [usageMap, setUsageMap] = useState<Record<number, number>>({});
  const BATCH = 50;

  const activeFilters = useMemo(
    () =>
      hasExerciseFilters(filters)
        ? {
            muscle: filters.muscle ?? undefined,
            equipment: filters.equipment ?? undefined,
            pattern: filters.pattern ?? undefined,
          }
        : undefined,
    [filters.muscle, filters.equipment, filters.pattern],
  );

  /** Usage counts for the customs in view (customs are few; per-row is fine). */
  const refreshUsage = useCallback(async (list: SupabaseExercise[]) => {
    const usage: Record<number, number> = {};
    await Promise.all(
      list.filter((i) => i.is_custom).map(async (c) => {
        usage[c.id] = await getCustomExerciseUsage(c.id);
      }),
    );
    setUsageMap(usage);
  }, []);

  /**
   * Offline-first load: SQLite answers from the local catalog (search text +
   * facets, one indexed path). Supabase only tops up thin unfiltered text
   * searches (<5 local hits) for catalog breadth — facet browsing is
   * local-only by design, so airplane mode keeps working.
   */
  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = query.trim();
      const hits = await searchExercises(q, activeFilters);
      const local = hits.map((h) => h.exercise);
      if (local.length === 0 && !q && !activeFilters) {
        // Catalog genuinely empty — legacy cloud-paginated fallback.
        const data = await fetchExercisesFromSupabase(BATCH, 0);
        const customs = (await listCustomExercises()).map(toSupabaseItem);
        await refreshUsage(customs);
        setItems([...customs, ...data]);
        setOffset(data.length);
        setHasMore(data.length === BATCH);
        setCloudOnly(true);
        return;
      }
      setCloudOnly(false);
      const items = local.map(toSupabaseItem);
      await refreshUsage(items);
      setItems(items);
      setOffset(0);
      setHasMore(false);
      if (q && !activeFilters && local.length < 5) {
        try {
          const data = await searchExercisesFromSupabase(q, BATCH);
          const seen = new Set([
            ...local.map((e) => (e.externalId ?? `local:${e.id}`).toLowerCase()),
            ...local.map((e) => e.name.toLowerCase()),
          ]);
          const extra = data.filter(
            (d) => !seen.has(d.external_id.toLowerCase()) && !seen.has(d.name.toLowerCase()),
          );
          if (extra.length > 0) setItems((prev) => [...prev, ...extra]);
        } catch {
          // Offline — local results stand alone.
        }
      }
    } catch {
      setError('Could not load exercises. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [query, activeFilters, refreshUsage]);

  const loadMore = useCallback(async () => {
    // Local mode serves the whole filtered catalog at once; only the
    // empty-catalog cloud fallback paginates.
    if (loading || !hasMore || !cloudOnly) return;
    setLoading(true);
    try {
      const data = await fetchExercisesFromSupabase(BATCH, offset);
      setItems((prev) => [...prev, ...data]);
      setOffset((prev) => prev + data.length);
      setHasMore(data.length === BATCH);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [loading, hasMore, offset, cloudOnly]);

  // Debounced search + filter changes re-run the local-first load.
  useEffect(() => {
    const timer = setTimeout(() => loadInitial(), 300);
    return () => clearTimeout(timer);
  }, [query, loadInitial]);

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
          <View className="mb-3">
            <ExerciseFilterBar
              value={filters}
              onChange={(next) => {
                setFilters(next);
                setOffset(0);
              }}
            />
          </View>
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
