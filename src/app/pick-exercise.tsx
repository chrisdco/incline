import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { ChevronLeft, Info, Plus } from 'lucide-react-native';

import { Body, Caption, Heading } from '@/components/common/text';
import { Icon } from '@/components/common/icon';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/common/search-bar';
import { MuscleBadge } from '@/components/exercise/muscle-badge';
import { CreateExerciseForm } from '@/components/exercise/create-exercise-form';
import { EmptyState } from '@/components/common/states';
import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';
import { useHaptics } from '@/hooks/use-haptics';
import { useToast } from '@/components/ui/toast';
import {
  addExerciseToWorkout,
  getExerciseSubstitutes,
  getRecentExercises,
  listExercises,
  replaceExerciseInWorkout,
  searchExercises,
} from '@/db/queries';
import type { Exercise } from '@/db/types';

type Params = {
  logId: string;
  mode?: string;
  exerciseId?: string;
  name?: string;
};

/**
 * Full-screen exercise chooser for live sessions (add + replace).
 * Local-first: catalog browse, ranked search, recents, and substitutes all
 * come from SQLite — no network wait in the gym. Tap a row to apply and go
 * back; the session refreshes on focus. The `i` affordance opens details.
 */
export default function PickExerciseScreen() {
  const { logId, mode, exerciseId, name } = useLocalSearchParams<Params>();
  const router = useRouter();
  const { toast } = useToast();
  const { impact } = useHaptics();
  const sessionId = Number(logId);
  const isReplace = mode === 'replace';
  const replaceId = exerciseId != null ? Number(exerciseId) : null;

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [catalog, setCatalog] = useState<Exercise[] | null>(null);
  const [results, setResults] = useState<Exercise[] | null>(null);
  const [suggested, setSuggested] = useState<Exercise[] | null>(null);
  const [recent, setRecent] = useState<Exercise[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [all, recents] = await Promise.all([
        listExercises(),
        getRecentExercises(8),
      ]);
      if (!active) return;
      setCatalog(all);
      setRecent(recents);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isReplace || replaceId == null || Number.isNaN(replaceId)) return;
    let active = true;
    void getExerciseSubstitutes(replaceId, 3)
      .then((subs) => {
        if (active) setSuggested(subs);
      })
      .catch(() => {
        if (active) setSuggested([]);
      });
    return () => {
      active = false;
    };
  }, [isReplace, replaceId]);

  useEffect(() => {
    if (!debounced) return;
    let active = true;
    void searchExercises(debounced)
      .then((hits) => {
        if (active) setResults(hits.map((h) => h.exercise));
      })
      .catch(() => {
        if (active) setResults([]);
      });
    return () => {
      active = false;
    };
  }, [debounced]);

  const applyExercise = useCallback(
    async (ex: Exercise) => {
      if (applying || Number.isNaN(sessionId)) return;
      setApplying(true);
      impact();
      try {
        if (isReplace && replaceId != null) {
          await replaceExerciseInWorkout(sessionId, replaceId, ex.id);
          toast({
            title: `Replaced with ${ex.name}`,
            description: 'Completed sets on the original stay in the log.',
            variant: 'info',
          });
        } else {
          await addExerciseToWorkout(sessionId, ex.id);
          toast({ title: `${ex.name} added`, variant: 'success' });
        }
        router.back();
      } catch {
        toast({ title: 'Could not update workout', variant: 'destructive' });
        setApplying(false);
      }
    },
    [applying, sessionId, isReplace, replaceId, impact, toast, router],
  );

  const openDetails = useCallback(
    (ex: Exercise) => {
      router.push(`/exercise/${ex.id}` as Href);
    },
    [router],
  );

  const rows = useMemo(() => {
    if (debounced) return results ?? [];
    return catalog ?? [];
  }, [debounced, results, catalog]);

  // Stable by-id callbacks so memoized rows skip re-renders on keystrokes.
  // Map syncs in an effect: callbacks only run on press, always post-render.
  const exerciseById = useRef(new Map<number, Exercise>());
  useEffect(() => {
    exerciseById.current = new Map(
      [...(catalog ?? []), ...(results ?? []), ...(suggested ?? []), ...(recent ?? [])].map((ex) => [ex.id, ex]),
    );
  });
  const applyById = useCallback((id: number) => {
    const ex = exerciseById.current.get(id);
    if (ex) void applyExercise(ex);
  }, [applyExercise]);
  const infoById = useCallback((id: number) => {
    const ex = exerciseById.current.get(id);
    if (ex) openDetails(ex);
  }, [openDetails]);

  const loading = catalog == null || (debounced !== '' && results == null);
  const showSections = !debounced && !creating;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-2 px-4 pb-2 pt-3">
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to workout"
          className="p-1">
          <Icon icon={ChevronLeft} size={24} color="foreground" />
        </Pressable>
        <View className="flex-1">
          <Heading className="text-lg">{isReplace ? 'Replace exercise' : 'Add exercise'}</Heading>
          {isReplace && name ? (
            <Caption numberOfLines={1}>Replacing {name}</Caption>
          ) : null}
        </View>
      </View>

      <View className="px-4 pb-2">
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search exercises" />
      </View>

      {creating ? (
        <View className="flex-1 px-4">
          <CreateExerciseForm
            onCreated={() => {
              setCreating(false);
              toast({ title: 'Exercise created', description: 'Tap it in the list to add.', variant: 'success' });
              void listExercises().then(setCatalog);
            }}
            onCancel={() => setCreating(false)}
          />
        </View>
      ) : loading ? (
        <View className="flex-1 items-center justify-center">
          <PrimaryActivityIndicator />
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item) => `${item.id}`}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            showSections ? (
              <View className="gap-5 pb-3">
                {suggested != null && suggested.length > 0 ? (
                  <View>
                    <Caption className="mb-2 font-medium uppercase tracking-wide">Suggested replacements</Caption>
                    <View className="gap-2">
                      {suggested.map((ex) => (
                        <ExercisePickRow
                          key={ex.id}
                          exerciseId={ex.id}
                          name={ex.name}
                          primaryMuscle={ex.primaryMuscle}
                          equipment={ex.equipment}
                          isCustom={ex.isCustom}
                          badge="Suggested"
                          disabled={applying}
                          onPick={applyById}
                          onInfo={infoById}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
                {recent != null && recent.length > 0 ? (
                  <View>
                    <Caption className="mb-2 font-medium uppercase tracking-wide">Recent</Caption>
                    <View className="gap-2">
                      {recent.map((ex) => (
                        <ExercisePickRow
                          key={ex.id}
                          exerciseId={ex.id}
                          name={ex.name}
                          primaryMuscle={ex.primaryMuscle}
                          equipment={ex.equipment}
                          isCustom={ex.isCustom}
                          disabled={applying}
                          onPick={applyById}
                          onInfo={infoById}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
                <View>
                  <Caption className="mb-2 font-medium uppercase tracking-wide">All exercises</Caption>
                  <Button
                    variant="outline"
                    leftIcon={<Icon icon={Plus} size={16} color="primary" />}
                    onPress={() => setCreating(true)}>
                    Create custom exercise
                  </Button>
                </View>
              </View>
            ) : (
              <View className="pb-3">
                <Button
                  variant="outline"
                  leftIcon={<Icon icon={Plus} size={16} color="primary" />}
                  onPress={() => setCreating(true)}>
                  Create custom exercise
                </Button>
              </View>
            )
          }
          renderItem={({ item }) => (
            <View className="mb-2">
              <ExercisePickRow
                exerciseId={item.id}
                name={item.name}
                primaryMuscle={item.primaryMuscle}
                equipment={item.equipment}
                isCustom={item.isCustom}
                disabled={applying}
                onPick={applyById}
                onInfo={infoById}
              />
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              title={debounced ? 'No exercises found' : 'No exercises yet'}
              description={debounced ? 'Try a different search or create a custom exercise.' : 'Create a custom exercise to get started.'}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

/** Memoized on primitives: catalog browsing re-renders the list per keystroke. */
const ExercisePickRow = memo(function ExercisePickRow({
  exerciseId,
  name,
  primaryMuscle,
  equipment,
  isCustom,
  badge,
  disabled,
  onPick,
  onInfo,
}: {
  exerciseId: number;
  name: string;
  primaryMuscle: Exercise['primaryMuscle'];
  equipment: string;
  isCustom: boolean;
  badge?: string;
  disabled?: boolean;
  onPick: (exerciseId: number) => void;
  onInfo: (exerciseId: number) => void;
}) {
  return (
    <View className="flex-row items-center gap-2 rounded-3xl bg-card p-4">
      <Pressable
        onPress={() => onPick(exerciseId)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Choose ${name}`}
        className="flex-1 flex-row items-center gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-sm font-semibold text-foreground" numberOfLines={1}>
              {name}
            </Text>
            {badge ? (
              <View className="rounded-full bg-primary/15 px-2 py-0.5">
                <Text className="text-[10px] font-semibold text-primary">{badge}</Text>
              </View>
            ) : null}
          </View>
          <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
            <MuscleBadge muscle={primaryMuscle} />
            <Text className="text-xs text-muted-foreground">{equipment}</Text>
          </View>
        </View>
      </Pressable>
      <Pressable
        onPress={() => onInfo(exerciseId)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`About ${name}`}
        className="p-2">
        <Icon icon={Info} size={18} color="muted-foreground" />
      </Pressable>
      {isCustom ? (
        <Body className="text-[10px] font-semibold text-primary">Custom</Body>
      ) : null}
    </View>
  );
});
