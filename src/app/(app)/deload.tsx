import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ListRow, Section } from '@/components/layout';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/toast';
import { DELOAD_APPLIED_KEY, DELOAD_SNOOZE_KEY, deloadSnoozeUntil, detectDeload } from '@/coaching/deload';
import { deloadReasonDetail } from '@/coaching/reason';
import { COACHING_RULE_VERSION } from '@/coaching/types';
import { useProgressStats } from '@/hooks/use-data';
import { kvStorage } from '@/db/kv';
import { createDeloadTemplate, getSuggestedTemplate, getTemplate } from '@/db/queries';
import type { WorkoutTemplate } from '@/db/types';
import { SCREEN_CONTENT } from '@/lib/layout';

/** User-confirmed deload copy. Never mutates the source routine. */
export default function DeloadScreen() {
  const { templateId } = useLocalSearchParams<{ templateId?: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [source, setSource] = useState<WorkoutTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: stats } = useProgressStats();

  // Explain with the same rule Home used; snooze / cooldown only gate the nudge,
  // so they're left out here. Null when the streak doesn't meet the rule.
  const detail = useMemo(() => {
    if (!stats) return null;
    const d = detectDeload({ weeklyStreak: stats.streak, weeklyVolumes: stats.weeklyVolume ?? [] });
    return d ? deloadReasonDetail(d, COACHING_RULE_VERSION) : null;
  }, [stats]);

  const load = useCallback(async () => {
    const id = templateId ? Number(templateId) : NaN;
    const t = Number.isFinite(id) ? await getTemplate(id) : await getSuggestedTemplate();
    setSource(t);
  }, [templateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onConfirm = async () => {
    if (!source || busy) return;
    setBusy(true);
    try {
      const newId = await createDeloadTemplate(source.id);
      await kvStorage.setItem(DELOAD_APPLIED_KEY, String(Date.now()));
      toast({ title: 'Deload routine ready', description: 'Original routine was not changed.', variant: 'success' });
      router.replace(`/template/${newId}` as Href);
    } catch (e) {
      toast({
        title: 'Could not create deload',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    }
    setBusy(false);
  };

  const onSnooze = async () => {
    await kvStorage.setItem(DELOAD_SNOOZE_KEY, String(deloadSnoozeUntil()));
    toast({ title: 'Remind you later', description: 'We will hold this suggestion for two weeks.', variant: 'info' });
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <Body className="text-base font-semibold text-foreground">Deload week</Body>
        <View className="w-8" />
      </View>

      <ScrollView contentContainerStyle={SCREEN_CONTENT} showsVerticalScrollIndicator={false}>
        <Caption className="mb-4">
          After several hard weeks, cutting sets to about 60% for one week helps you recover. Nothing is applied until you confirm.
        </Caption>

        {detail ? (
          <View className="mb-6">
            <Section title="Why" first>
              <Card>
                <Body className="text-foreground">{detail.reason.sentence}</Body>
              </Card>
            </Section>
            <Section title="Inputs">
              <Card className="py-1">
                {detail.inputs.map((row, i) => (
                  <View key={row.label}>
                    {i > 0 ? <Separator /> : null}
                    <ListRow title={row.label}>
                      <Body className="tabular-nums text-muted-foreground">{row.value}</Body>
                    </ListRow>
                  </View>
                ))}
              </Card>
            </Section>
            <Section title="Rule">
              <Caption className="px-1">{detail.rule}</Caption>
            </Section>
          </View>
        ) : null}

        {source ? (
          <Card className="mb-4 p-4">
            <Body className="font-semibold text-foreground">{source.name}</Body>
            <Caption className="mt-1">
              {(source.exercises ?? []).length} exercises · working sets cut to ~60%
            </Caption>
          </Card>
        ) : (
          <Caption className="mb-4">No routine to scale yet. Finish a workout from a template first.</Caption>
        )}

        <Button onPress={onConfirm} disabled={!source || busy} className="mb-3">
          Create deload copy
        </Button>
        <Button variant="outline" onPress={onSnooze} disabled={busy}>
          Not this week
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
