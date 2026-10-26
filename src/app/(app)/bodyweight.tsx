import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import { Plus, ChevronDown, BarChart3, Settings2 } from 'lucide-react-native';
import { Icon } from '@/components/common/icon';

import { Body, Caption, Text } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Chip } from '@/components/common/chip';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { useHaptics } from '@/hooks/use-haptics';
import { SeriesAreaChart } from '@/components/progress/series-area-chart';
import {
  addBodyweightEntry,
  getBodyweightEntries,
  deleteBodyweightEntry,
  addBodyMeasurement,
  getBodyMeasurements,
  deleteBodyMeasurement,
} from '@/db/queries';
import { useSettings } from '@/store/settings-store';
import { BODY_METRIC_LABELS, bodyMetricUnit } from '@/lib/body-metrics';
import { SCREEN_CONTENT } from '@/lib/layout';
import { cn } from '@/lib/cn';
import { BODY_METRICS, type BodyMetric } from '@/db/types';

interface HistoryRow {
  id: number;
  value: number;
  unit: string;
  recordedAt: number;
  source: 'bodyweight' | 'measurement';
}

type TimeRange = '1m' | '3m' | '6m' | '1y' | 'all';

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '1m', label: 'Last month' },
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
  { value: '1y', label: 'Last year' },
  { value: 'all', label: 'All time' },
];

function getRangeMs(range: TimeRange): number {
  switch (range) {
    case '1m':
      return 30 * 24 * 60 * 60 * 1000;
    case '3m':
      return 90 * 24 * 60 * 60 * 1000;
    case '6m':
      return 180 * 24 * 60 * 60 * 1000;
    case '1y':
      return 365 * 24 * 60 * 60 * 1000;
    case 'all':
      return Infinity;
  }
}

function MiniChart({
  title,
  data,
  unitLabel,
}: {
  title: string;
  data: HistoryRow[];
  unitLabel: string;
}) {
  if (data.length < 2) {
    return (
      <View className="mt-4 items-center justify-center rounded-2xl border border-border/60 bg-card px-4 py-10">
        <Icon icon={BarChart3} size={36} color="muted-foreground" />
        <Body className="mt-3 text-muted-foreground">No data in time period</Body>
      </View>
    );
  }

  const points = [...data].reverse().map((e) => ({
    value: e.value,
    label: new Date(e.recordedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }));

  return (
    <View className="mt-4">
      <SeriesAreaChart
        title={title}
        points={points}
        formatValue={(v) => v.toFixed(1)}
        valueHint={unitLabel}
        height={150}
      />
    </View>
  );
}

function TimeRangeDropdown({ value, onChange }: { value: TimeRange; onChange: (v: TimeRange) => void }) {
  const [open, setOpen] = useState(false);
  const label = TIME_RANGES.find((r) => r.value === value)?.label ?? value;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} className="flex-row items-center gap-1">
        <Text className="text-sm font-medium text-primary">{label}</Text>
        <Icon icon={ChevronDown} size={14} color="primary" />
      </Pressable>

      <Dialog open={open} onOpenChange={setOpen} title="Time range">
        <View className="gap-1 py-2">
          {TIME_RANGES.map((r) => (
            <Pressable
              key={r.value}
              onPress={() => {
                onChange(r.value);
                setOpen(false);
              }}
              className={cn('rounded-xl px-4 py-3', value === r.value ? 'bg-primary/15' : 'active:bg-muted')}>
              <Body className={cn(value === r.value ? 'font-semibold text-primary' : 'text-foreground')}>
                {r.label}
              </Body>
            </Pressable>
          ))}
        </View>
      </Dialog>
    </>
  );
}

export default function BodyweightScreen() {
  const navigation = useNavigation();
  const { toast } = useToast();
  const { impact } = useHaptics();
  const { unit, enabledBodyMetrics, toggleBodyMetric } = useSettings();

  const visibleMetrics = useMemo(
    () => BODY_METRICS.filter((m) => enabledBodyMetrics.includes(m)),
    [enabledBodyMetrics],
  );

  const [metric, setMetric] = useState<BodyMetric>('bodyweight');
  const [entries, setEntries] = useState<HistoryRow[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('3m');
  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [valueInput, setValueInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<HistoryRow | null>(null);

  useEffect(() => {
    if (!visibleMetrics.includes(metric)) {
      setMetric(visibleMetrics[0] ?? 'bodyweight');
    }
  }, [visibleMetrics, metric]);

  const load = useCallback(async () => {
    if (metric === 'bodyweight') {
      const data = await getBodyweightEntries(365);
      setEntries(
        data.map((e) => ({
          id: e.id,
          value: e.weight,
          unit: e.unit,
          recordedAt: e.recordedAt,
          source: 'bodyweight' as const,
        })),
      );
      return;
    }
    const data = await getBodyMeasurements(metric, 365);
    setEntries(
      data.map((e) => ({
        id: e.id,
        value: e.value,
        unit: e.unit,
        recordedAt: e.recordedAt,
        source: 'measurement' as const,
      })),
    );
  }, [metric]);

  useEffect(() => {
    void load();
  }, [load]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View className="mr-1 flex-row items-center">
          <Pressable
            onPress={() => setManageOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Manage metrics"
            hitSlop={8}
            className="p-2">
            <Icon icon={Settings2} size={20} color="foreground" />
          </Pressable>
          <Pressable
            onPress={() => setAddOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Add measurement"
            hitSlop={8}
            className="p-2">
            <Icon icon={Plus} size={22} color="foreground" />
          </Pressable>
        </View>
      ),
    });
  }, [navigation]);

  const [now] = useState(() => Date.now());
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (timeRange === 'all') return true;
      return e.recordedAt >= now - getRangeMs(timeRange);
    });
  }, [entries, timeRange, now]);

  const unitLabel = bodyMetricUnit(metric, unit);

  const addEntry = async () => {
    const v = parseFloat(valueInput.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      toast({ title: 'Enter a valid value', variant: 'warning' });
      return;
    }
    if (metric === 'bodyweight') {
      await addBodyweightEntry(v, unitLabel);
    } else {
      await addBodyMeasurement(metric, v, unitLabel);
    }
    impact();
    setAddOpen(false);
    setValueInput('');
    toast({ title: `${BODY_METRIC_LABELS[metric]} logged`, variant: 'success' });
    void load();
  };

  const removeEntry = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.source === 'bodyweight') {
      await deleteBodyweightEntry(deleteTarget.id);
    } else {
      await deleteBodyMeasurement(deleteTarget.id);
    }
    impact();
    setDeleteTarget(null);
    toast({ title: 'Entry deleted', variant: 'info' });
    void load();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={SCREEN_CONTENT}>
        <View className="mt-2 flex-row flex-wrap gap-1.5">
          {visibleMetrics.map((m) => (
            <Chip
              key={m}
              size="sm"
              label={BODY_METRIC_LABELS[m]}
              selected={metric === m}
              onPress={() => setMetric(m)}
            />
          ))}
        </View>

        <View className="mt-4 items-end">
          <TimeRangeDropdown value={timeRange} onChange={setTimeRange} />
        </View>

        <MiniChart title={BODY_METRIC_LABELS[metric]} data={filteredEntries} unitLabel={unitLabel} />

        <View className="mt-6">
          <Body className="text-base text-muted-foreground">{BODY_METRIC_LABELS[metric]} history</Body>

          {filteredEntries.length === 0 ? (
            <View className="items-center py-10">
              <Caption>No entries in this time period.</Caption>
            </View>
          ) : (
            <View className="mt-3">
              {filteredEntries.map((e) => (
                <Pressable
                  key={`${e.source}-${e.id}`}
                  onLongPress={() => setDeleteTarget(e)}
                  className="flex-row items-center justify-between border-b border-border/40 py-3.5">
                  <Body className="text-sm text-foreground">
                    {new Date(e.recordedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Body>
                  <Body className="text-sm font-medium text-foreground">
                    {e.value.toFixed(1)} {e.unit}
                  </Body>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Dialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title={`Log ${BODY_METRIC_LABELS[metric].toLowerCase()}`}
        footer={
          <>
            <Button variant="outline" onPress={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onPress={() => void addEntry()}>Save</Button>
          </>
        }>
        <View className="gap-3 py-2">
          <View className="flex-row flex-wrap gap-1.5">
            {visibleMetrics.map((m) => (
              <Chip
                key={`add-${m}`}
                size="sm"
                label={BODY_METRIC_LABELS[m]}
                selected={metric === m}
                onPress={() => setMetric(m)}
              />
            ))}
          </View>
          <Input
            value={valueInput}
            onChangeText={setValueInput}
            placeholder={metric === 'bodyweight' ? (unit === 'metric' ? 'e.g. 75.5' : 'e.g. 166.4') : 'e.g. 84'}
            keyboardType="decimal-pad"
            autoFocus
          />
          <Caption>{unitLabel === 'kg' ? 'Kilograms' : unitLabel === 'lb' ? 'Pounds' : unitLabel === 'cm' ? 'Centimeters' : 'Inches'}</Caption>
        </View>
      </Dialog>

      <Dialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        title="Visible metrics"
        footer={<Button onPress={() => setManageOpen(false)}>Done</Button>}>
        <View className="gap-1 py-2">
          <Caption className="mb-2">Turn metrics off to hide them from logging and charts. Bodyweight stays on.</Caption>
          {BODY_METRICS.map((m) => {
            const enabled = enabledBodyMetrics.includes(m);
            const locked = m === 'bodyweight';
            return (
              <View key={m} className="flex-row items-center justify-between py-2.5">
                <Body className="text-foreground">{BODY_METRIC_LABELS[m]}</Body>
                <Switch
                  value={enabled}
                  disabled={locked}
                  onValueChange={() => toggleBodyMetric(m)}
                  accessibilityLabel={`Toggle ${BODY_METRIC_LABELS[m]}`}
                />
              </View>
            );
          })}
        </View>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete entry?"
        description="This cannot be undone."
        footer={
          <>
            <Button variant="outline" onPress={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onPress={() => void removeEntry()}>
              Delete
            </Button>
          </>
        }
      />
    </SafeAreaView>
  );
}
