import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Dumbbell, X } from 'lucide-react-native';

import { Chip } from '@/components/common/chip';
import { Icon } from '@/components/common/icon';
import { SearchBar } from '@/components/common/search-bar';
import { EmptyState } from '@/components/common/states';
import { Body, Caption } from '@/components/common/text';
import { Sheet } from '@/components/ui/sheet';
import { listExercisesUsedInHistory } from '@/db/queries';
import { useTemplateSummaries } from '@/hooks/use-data';
import type { ProgressRange } from '@/db/types';

const HISTORY_RANGES: { value: ProgressRange; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: '1w', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '3m', label: '3M' },
  { value: '1y', label: '1Y' },
];

export type HistoryFilterSelection = {
  id: number;
  name: string;
};

/**
 * Compact History filter chips only.
 * Sheets must mount at the Progress screen root (not inside FlashList) or
 * `@expo/ui` bottom sheets render empty.
 */
export function HistoryFilters({
  range,
  onRangeChange,
  exercise,
  onExerciseChange,
  template,
  onTemplateChange,
  onOpenExerciseSheet,
  onOpenTemplateSheet,
}: {
  range: ProgressRange;
  onRangeChange: (range: ProgressRange) => void;
  exercise: HistoryFilterSelection | null;
  onExerciseChange: (exercise: HistoryFilterSelection | null) => void;
  template: HistoryFilterSelection | null;
  onTemplateChange: (template: HistoryFilterSelection | null) => void;
  onOpenExerciseSheet: () => void;
  onOpenTemplateSheet: () => void;
}) {
  const hasEntityFilter = exercise != null || template != null;

  return (
    <View className="mt-3 gap-2.5">
      {/* flex-wrap avoids nested horizontal ScrollView ↔ FlashList jump */}
      <View className="flex-row flex-wrap gap-2">
        {HISTORY_RANGES.map((r) => (
          <Chip
            key={r.value}
            size="sm"
            label={r.label}
            selected={range === r.value}
            onPress={() => onRangeChange(r.value)}
          />
        ))}
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Chip
          size="sm"
          label={exercise ? truncate(exercise.name, 18) : 'Exercise'}
          selected={exercise != null}
          onPress={onOpenExerciseSheet}
        />
        <Chip
          size="sm"
          label={template ? truncate(template.name, 18) : 'Template'}
          selected={template != null}
          onPress={onOpenTemplateSheet}
        />
        {hasEntityFilter ? (
          <Pressable
            onPress={() => {
              onExerciseChange(null);
              onTemplateChange(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear exercise and template filters"
            className="flex-row items-center gap-1 rounded-full border border-border/70 px-2.5 py-1">
            <Icon icon={X} size={12} color="muted-foreground" />
            <Caption className="text-xs text-muted-foreground">Clear</Caption>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function HistoryExerciseFilterSheet({
  open,
  onOpenChange,
  selectedId,
  onPick,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId: number | null;
  onPick: (exercise: HistoryFilterSelection) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [all, setAll] = useState<HistoryFilterSelection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    listExercisesUsedInHistory()
      .then((rows) => {
        if (!cancelled) setAll(rows);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load exercises.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((e) => e.name.toLowerCase().includes(q));
  }, [all, query]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Filter by exercise" mode="expandable" scroll>
      <View className="mb-3 gap-3">
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search logged exercises..." />
        {selectedId != null ? (
          <Pressable onPress={onClear} accessibilityRole="button">
            <Caption className="font-medium text-primary-text">Clear exercise filter</Caption>
          </Pressable>
        ) : null}
      </View>
      <View style={{ minHeight: 280 }}>
        {error ? (
          <EmptyState title="Error" description={error} />
        ) : loading && items.length === 0 ? (
          <Caption className="py-6 text-center text-muted-foreground">Loading…</Caption>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Icon icon={Dumbbell} size={24} color="muted-foreground" />}
            title="No exercises yet"
            description="Complete workouts to filter history by exercise."
          />
        ) : (
          items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onPick(item)}
              accessibilityRole="button"
              className="mb-2 rounded-2xl border border-border/60 bg-card px-4 py-3"
              android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
              <Body className="font-semibold text-foreground">{item.name}</Body>
              {selectedId === item.id ? (
                <Caption className="mt-0.5 text-primary-text">Selected</Caption>
              ) : null}
            </Pressable>
          ))
        )}
      </View>
    </Sheet>
  );
}

export function HistoryTemplateFilterSheet({
  open,
  onOpenChange,
  selectedId,
  onPick,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedId: number | null;
  onPick: (template: HistoryFilterSelection) => void;
  onClear: () => void;
}) {
  const templates = useTemplateSummaries();
  const items = templates.data ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Filter by template" mode="expandable" scroll>
      {selectedId != null ? (
        <Pressable onPress={onClear} accessibilityRole="button" className="mb-3">
          <Caption className="font-medium text-primary-text">Clear template filter</Caption>
        </Pressable>
      ) : null}
      <View style={{ minHeight: 280 }}>
        {templates.loading ? (
          <Caption className="py-6 text-center text-muted-foreground">Loading…</Caption>
        ) : items.length === 0 ? (
          <EmptyState title="No templates" description="Create a routine to filter by template." />
        ) : (
          items.map((summary) => {
            const t = summary.template;
            return (
              <Pressable
                key={t.id}
                onPress={() => onPick({ id: t.id, name: t.name })}
                accessibilityRole="button"
                className="mb-2 rounded-2xl border border-border/60 bg-card px-4 py-3"
                android_ripple={{ color: 'rgba(0,0,0,0.04)' }}>
                <Body className="font-semibold text-foreground">{t.name}</Body>
                <Caption className="mt-0.5 text-muted-foreground" numberOfLines={1}>
                  {summary.exerciseCount} exercises
                  {selectedId === t.id ? ' · Selected' : ''}
                </Caption>
              </Pressable>
            );
          })
        )}
      </View>
    </Sheet>
  );
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

/** Map ProgressRange → sinceMs for history list filters (`all` → undefined). */
export function historyRangeSinceMs(range: ProgressRange, now = Date.now()): number | undefined {
  if (range === 'all') return undefined;
  const DAY = 86_400_000;
  const ms =
    range === '1w' ? 7 * DAY : range === '30d' ? 30 * DAY : range === '3m' ? 90 * DAY : 365 * DAY;
  return now - ms;
}
