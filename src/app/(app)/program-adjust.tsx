import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import {
  PLAN_APPLIED_KEY,
  PLAN_SNOOZE_KEY,
  planSnoozeUntil,
  type ProgramPlanDiff,
  type ProgramPlanKind,
} from '@/coaching/program-plan';
import { kvStorage } from '@/db/kv';
import {
  clearProgramDay,
  createDeloadTemplate,
  getActiveProgramPlanDiff,
  setProgramDay,
} from '@/db/queries';
import { SCREEN_CONTENT } from '@/lib/layout';
import { refreshWidgets } from '@/lib/widgets/refresh';

const DAY_LABEL = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const KIND_COPY: Record<
  ProgramPlanKind,
  { screenTitle: string; emptyBody: string }
> = {
  catch_up: {
    screenTitle: 'Catch up',
    emptyBody: 'No catch-up needed right now.',
  },
  deload_insert: {
    screenTitle: 'Add lighter day',
    emptyBody: 'No lighter-day slot right now.',
  },
};

function parsePlanKind(raw: string | string[] | undefined): ProgramPlanKind | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'catch_up' || value === 'deload_insert') return value;
  return null;
}

/** User-confirmed program week change. Never writes until Confirm. */
export default function ProgramAdjustScreen() {
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const [diff, setDiff] = useState<ProgramPlanDiff | null>(null);
  const [busy, setBusy] = useState(false);
  const linkKind = parsePlanKind(kindParam);
  const activeKind = diff?.kind ?? linkKind;

  const load = useCallback(async () => {
    const next = await getActiveProgramPlanDiff();
    setDiff(next);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onConfirm = async () => {
    if (!diff || busy) return;
    setBusy(true);
    try {
      let templateId = diff.templateId;
      if (diff.kind === 'deload_insert') {
        templateId = await createDeloadTemplate(diff.templateId);
      }
      await setProgramDay(diff.programId, diff.targetWeek, diff.targetDay, templateId);
      if (diff.kind === 'catch_up' && diff.clearWeek != null && diff.clearDay != null) {
        await clearProgramDay(diff.programId, diff.clearWeek, diff.clearDay);
      }
      await kvStorage.setItem(PLAN_APPLIED_KEY, String(Date.now()));
      void refreshWidgets();
      toast({
        title: diff.kind === 'catch_up' ? 'Catch-up scheduled' : 'Lighter day added',
        description: `${diff.templateName} → week ${diff.targetWeek} ${DAY_LABEL[diff.targetDay] ?? ''}`.trim(),
        variant: 'success',
      });
      router.replace(`/program/${diff.programId}` as Href);
    } catch (e) {
      toast({
        title: 'Could not update program',
        description: e instanceof Error ? e.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const onSnooze = async () => {
    await kvStorage.setItem(PLAN_SNOOZE_KEY, String(planSnoozeUntil()));
    toast({ title: 'Remind you later', description: 'Held for a few days.', variant: 'info' });
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <Body className="text-base font-semibold text-foreground">
          {activeKind ? KIND_COPY[activeKind].screenTitle : 'Adjust this week'}
        </Body>
        <View className="w-8" />
      </View>

      <ScrollView contentContainerStyle={SCREEN_CONTENT} showsVerticalScrollIndicator={false}>
        <Caption className="mb-4">
          Suggestions only — your program stays put until you confirm.
        </Caption>

        {diff ? (
          <Card className="mb-4 p-4">
            <Body className="font-semibold text-foreground">{diff.title}</Body>
            <Caption className="mt-2">{diff.body}</Caption>
            <Caption className="mt-3">
              {diff.programName} · week {diff.targetWeek} · {DAY_LABEL[diff.targetDay] ?? `day ${diff.targetDay}`}
            </Caption>
            <Caption className="mt-1">
              {diff.kind === 'deload_insert' ? 'Creates a deload copy, then places it.' : `Places ${diff.templateName}.`}
            </Caption>
          </Card>
        ) : (
          <Caption className="mb-4">
            {linkKind ? KIND_COPY[linkKind].emptyBody : 'No plan change needed right now.'}
          </Caption>
        )}

        <Button onPress={onConfirm} disabled={!diff || busy} className="mb-3">
          Confirm change
        </Button>
        <Button variant="outline" onPress={onSnooze} disabled={busy}>
          Not now
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
