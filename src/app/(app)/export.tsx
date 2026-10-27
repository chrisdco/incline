import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { SectionLabel } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/common/chip';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { shareSelectedExport } from '@/db/queries';
import {
  DEFAULT_EXPORT_SELECTION,
  EXPORT_SECTION_OPTIONS,
  selectedExportSections,
  type ExportRange,
  type ExportSelection,
} from '@/lib/export-data';
import { SCREEN_CONTENT } from '@/lib/layout';

const EXPORT_RANGES: { id: ExportRange; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: '365d', label: '1y' },
];

// Module-level so the share handler's try block stays free of conditionals
// (React Compiler can't lower them inside try/catch).
function exportResultToast(result: Awaited<ReturnType<typeof shareSelectedExport>>) {
  if (!result.shared) {
    return {
      title: 'Nothing to export',
      description: 'Try a wider date range or another type.',
      variant: 'warning' as const,
    };
  }
  const asJson = result.format === 'json';
  return {
    title: asJson ? 'JSON ready to share' : 'CSV ready to share',
    description: result.usedJsonFallback
      ? 'Mixed types exported as JSON'
      : `${result.itemCount} item${result.itemCount === 1 ? '' : 's'}`,
    variant: 'success' as const,
  };
}

export default function ExportScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const [selection, setSelection] = useState<ExportSelection>(DEFAULT_EXPORT_SELECTION);
  const [range, setRange] = useState<ExportRange>('all');
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [busy, setBusy] = useState(false);

  const sections = selectedExportSections(selection);
  const csvNeedsJson = format === 'csv' && sections.length > 1;

  const formatHint = useMemo(() => {
    if (format === 'json') return 'One backup file with only the types you selected.';
    if (sections.length > 1) return 'CSV is one table. Mixed types will export as JSON instead.';
    if (sections.length === 0) return 'Turn on at least one type.';
    return 'One spreadsheet of the selected type.';
  }, [format, sections.length]);

  const toggle = (id: keyof ExportSelection) => {
    setSelection((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const run = async () => {
    if (busy || sections.length === 0) return;
    setBusy(true);
    try {
      const result = await shareSelectedExport(format, range, selection);
      toast(exportResultToast(result));
    } catch {
      toast({ title: 'Could not export data', variant: 'destructive' });
    }
    setBusy(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <Body className="text-base font-semibold text-foreground">Export</Body>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ ...SCREEN_CONTENT, paddingBottom: 40 }}>
        <SectionLabel className="mb-1 mt-1">What to include</SectionLabel>
        <Card>
          {EXPORT_SECTION_OPTIONS.map((opt, i) => (
            <View
              key={opt.id}
              className={`flex-row items-center gap-3 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
              <View className="min-w-0 flex-1">
                <Body className="font-medium text-foreground">{opt.label}</Body>
                <Caption className="mt-0.5">{opt.hint}</Caption>
              </View>
              <Switch
                value={selection[opt.id]}
                onValueChange={() => toggle(opt.id)}
                accessibilityLabel={opt.label}
              />
            </View>
          ))}
        </Card>

        <SectionLabel className="mb-1 mt-5">Date range</SectionLabel>
        <Card>
          <View className="flex-row flex-wrap gap-1.5 py-3">
            {EXPORT_RANGES.map((r) => (
              <Chip
                key={r.id}
                size="sm"
                label={r.label}
                selected={range === r.id}
                onPress={() => setRange(r.id)}
              />
            ))}
          </View>
        </Card>

        <SectionLabel className="mb-1 mt-5">Format</SectionLabel>
        <Card>
          <View className="gap-3 py-3">
            <View className="flex-row gap-1.5">
              <Chip label="JSON" selected={format === 'json'} onPress={() => setFormat('json')} />
              <Chip label="CSV" selected={format === 'csv'} onPress={() => setFormat('csv')} />
            </View>
            <Caption>{formatHint}</Caption>
          </View>
        </Card>

        <Button className="mt-6" disabled={busy || sections.length === 0} onPress={() => void run()}>
          {busy ? 'Preparing…' : csvNeedsJson ? 'Export JSON' : format === 'csv' ? 'Export CSV' : 'Export JSON'}
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
