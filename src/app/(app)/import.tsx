import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from '@/components/common/styled';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { ArrowLeft, FileUp } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { Chip } from '@/components/common/chip';
import { ListRow, Section, SectionLabel, StatBlock } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { ExercisePickerSheet } from '@/components/workout/exercise-picker-sheet';
import { importWorkouts, type ImportOutcome } from '@/db/queries/import';
import type { Exercise } from '@/db/types';
import { parseExportCsv, type ParseResult } from '@/lib/import/csv-parse';
import { matchExerciseNames, type ExerciseMatch } from '@/lib/import/match';
import { distinctExerciseNames, importStats, planWorkouts } from '@/lib/import/plan';
import { SCREEN_CONTENT } from '@/lib/layout';
import { catalogQuery } from '@/lib/query-keys';
import { useSettings } from '@/store/settings-store';

type Row =
  | { kind: 'label'; id: string; label: string }
  | { kind: 'toggle'; id: string; count: number; open: boolean }
  | { kind: 'match'; id: string; match: ExerciseMatch };

function formatDay(ms: number | null): string {
  return ms == null ? '—' : new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export default function ImportScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const settingsUnit = useSettings((s) => s.unit);
  const catalog = useQuery(catalogQuery).data;

  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [strongUnit, setStrongUnit] = useState<'kg' | 'lb'>(settingsUnit === 'imperial' ? 'lb' : 'kg');
  const [overrides, setOverrides] = useState<Map<string, Exercise>>(new Map());
  const [showConfident, setShowConfident] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const parsed = useMemo<ParseResult | { error: string } | null>(
    () => (text == null ? null : parseExportCsv(text, strongUnit)),
    [text, strongUnit],
  );
  const result = parsed && 'workouts' in parsed ? parsed : null;
  const planned = useMemo(() => (result ? planWorkouts(result) : []), [result]);
  const stats = useMemo(() => importStats(planned), [planned]);

  const catalogById = useMemo(() => new Map((catalog ?? []).map((e) => [e.id, e])), [catalog]);
  const matches = useMemo(() => {
    if (!catalog) return [];
    const candidates = catalog.map((e) => ({ id: e.id, name: e.name, aliases: e.aliases, equipment: e.equipment }));
    return matchExerciseNames(distinctExerciseNames(planned), candidates);
  }, [catalog, planned]);

  const effective = useMemo(
    () =>
      matches.map((m) => {
        const o = overrides.get(m.importName);
        return o ? { ...m, exerciseId: o.id, confidence: 'confident' as const } : m;
      }),
    [matches, overrides],
  );

  const rows = useMemo<Row[]>(() => {
    const confident = effective.filter((m) => m.confidence === 'confident');
    const review = effective.filter((m) => m.confidence === 'review');
    const none = effective.filter((m) => m.confidence === 'none');
    const out: Row[] = [];
    if (review.length > 0) {
      out.push({ kind: 'label', id: 'l-review', label: `Check these (${review.length})` });
      for (const m of review) out.push({ kind: 'match', id: `r-${m.importName}`, match: m });
    }
    if (none.length > 0) {
      out.push({ kind: 'label', id: 'l-new', label: `New custom exercises (${none.length})` });
      for (const m of none) out.push({ kind: 'match', id: `n-${m.importName}`, match: m });
    }
    if (confident.length > 0) {
      out.push({ kind: 'toggle', id: 't-confident', count: confident.length, open: showConfident });
      if (showConfident) for (const m of confident) out.push({ kind: 'match', id: `c-${m.importName}`, match: m });
    }
    return out;
  }, [effective, showConfident]);

  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets[0]) return;
      const asset = res.assets[0];
      const content = await readAsStringAsync(asset.uri);
      setOverrides(new Map());
      setOutcome(null);
      setFileName(asset.name);
      setText(content);
    } catch {
      toast({ title: 'Could not read that file', variant: 'destructive' });
    }
  };

  const runImport = async () => {
    if (busy || planned.length === 0) return;
    setBusy(true);
    const exerciseIds = new Map(effective.map((m) => [m.importName, m.exerciseId] as const));
    const equipment = new Map(effective.map((m) => [m.importName, m.equipment] as const));
    try {
      setOutcome(await importWorkouts(planned, { exerciseIds, equipment }));
    } catch {
      toast({ title: 'Import failed', description: 'Nothing was changed.', variant: 'destructive' });
    }
    setBusy(false);
  };

  const targetName = (m: ExerciseMatch): string => {
    const o = overrides.get(m.importName);
    if (o) return o.name;
    if (m.exerciseId == null) return 'Creates a custom exercise';
    return catalogById.get(m.exerciseId)?.name ?? 'Catalog exercise';
  };

  const header = (
    <View>
      <Section first title="File">
        <Card>
          <ListRow
            icon={<Icon icon={FileUp} size={18} color="muted-foreground" />}
            title={fileName ?? 'Choose a CSV export'}
            subtitle={
              result
                ? `${result.source === 'hevy' ? 'Hevy' : 'Strong'} export detected`
                : 'Strong: Settings → Export data. Hevy: Settings → Export & import.'
            }
            onPress={() => void pick()}
          />
        </Card>
        {parsed && 'error' in parsed ? <Caption className="mt-2 px-1">{parsed.error}</Caption> : null}
      </Section>

      {result?.source === 'strong' ? (
        <Section title="Strong weight unit">
          <Card>
            <View className="gap-2 py-3">
              <View className="flex-row gap-2">
                <Chip label="kg" selected={strongUnit === 'kg'} onPress={() => setStrongUnit('kg')} />
                <Chip label="lb" selected={strongUnit === 'lb'} onPress={() => setStrongUnit('lb')} />
              </View>
              <Caption>Strong files usually omit the unit. Pick the one your Strong app was set to.</Caption>
            </View>
          </Card>
        </Section>
      ) : null}

      {result ? (
        <Section title="Preview">
          <Card>
            <View className="flex-row py-3">
              <StatBlock label="Workouts" value={stats.workouts} />
              <StatBlock label="Sets" value={stats.sets} />
              <StatBlock label="Exercises" value={matches.length} />
            </View>
            <Caption className="pb-3 text-center">
              {formatDay(stats.firstAt)} – {formatDay(stats.lastAt)}
            </Caption>
          </Card>
          {result.errors.length + result.warnings.length > 0 ? (
            <Caption className="mt-2 px-1">
              {plural(result.errors.length, 'row')} unreadable, {plural(result.warnings.length, 'row')} adjusted or skipped.
            </Caption>
          ) : null}
        </Section>
      ) : null}
      {result && matches.length > 0 ? (
        <SectionLabel className="mt-6">Exercise matching · tap to change</SectionLabel>
      ) : null}
    </View>
  );

  const footer = result ? (
    <View className="mt-6 gap-3">
      {outcome ? (
        <Card>
          <ListRow
            title={`Imported ${plural(outcome.importedWorkouts, 'workout')}`}
            subtitle={`${plural(outcome.importedSets, 'set')} · ${plural(outcome.createdExercises, 'new exercise')} · ${plural(outcome.skippedExisting, 'duplicate')} skipped`}
          />
        </Card>
      ) : null}
      {outcome ? (
        <Button onPress={() => router.back()}>Done</Button>
      ) : (
        <Button disabled={busy || planned.length === 0 || !catalog} onPress={() => void runImport()}>
          {busy ? 'Importing…' : `Import ${plural(stats.workouts, 'workout')}`}
        </Button>
      )}
      <Caption className="px-1">
        Re-importing the same file skips workouts already here (same start minute and name). Weights are stored in kg.
      </Caption>
    </View>
  ) : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <Body className="text-base font-semibold text-foreground">Import from Strong / Hevy</Body>
      </View>

      <FlashList
        data={rows}
        keyExtractor={(r) => r.id}
        getItemType={(r) => r.kind}
        contentContainerStyle={{ ...SCREEN_CONTENT, paddingBottom: 40 }}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        renderItem={({ item }) => {
          if (item.kind === 'label') return <Caption className="px-1 pb-1 pt-3">{item.label}</Caption>;
          if (item.kind === 'toggle') {
            return (
              <ListRow
                title={`${item.count} matched automatically`}
                subtitle={item.open ? 'Tap to hide' : 'Tap to review'}
                onPress={() => setShowConfident((v) => !v)}
              />
            );
          }
          const m = item.match;
          return (
            <ListRow
              title={m.importName}
              subtitle={`→ ${targetName(m)}`}
              accessibilityLabel={`Change match for ${m.importName}`}
              onPress={() => setPickerFor(m.importName)}
            />
          );
        }}
      />

      <ExercisePickerSheet
        open={pickerFor != null}
        onOpenChange={(open) => {
          if (!open) setPickerFor(null);
        }}
        onPick={(exercise) => {
          if (pickerFor == null) return;
          setOverrides((prev) => new Map(prev).set(pickerFor, exercise));
        }}
      />
    </SafeAreaView>
  );
}
