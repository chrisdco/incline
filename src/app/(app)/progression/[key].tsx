import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AskAboutLink } from '@/components/ai/ask-about-button';
import { Icon } from '@/components/common/icon';
import { Body, Caption, Text } from '@/components/common/text';
import { ListRow, Section } from '@/components/layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tappable } from '@/components/ui/tappable';
import { useToast } from '@/components/ui/toast';
import {
  assessProposal,
  DECISION_STATUS_LABEL,
  decisionSourceLabel,
  formatLoad,
  PLATEAU_SESSIONS,
  PROGRESSION_RULE_VERSION,
  REMEDY_LABEL,
  type FixOption,
  type PlateauFinding,
  type RemedyPlan,
} from '@/contracts/coaching/progression';
import { planText } from '@/contracts/mcp/shape';
import { getExerciseSubstitutes } from '@/db/queries';
import { declineFix, type StoredDecision } from '@/db/queries/progression';
import type { Exercise } from '@/db/types';
import { applyFix, undoFix } from '@/features/progression/apply';
import { useProgressionReview, useRoutinesWithExercise } from '@/hooks/use-data';
import { SCREEN_CONTENT } from '@/lib/layout';

const VERDICT_COPY = {
  matches: "Same as Incline's fix.",
  differs: "Different from Incline's fix. Both are reasonable; you choose.",
  unsafe: 'Outside the safe range, so it can only be made by hand.',
} as const;

/**
 * One stalled lift (PROGRESSION.md §7): why it stalled, Incline's fix with
 * its evidence, the alternatives, and any suggestion from Ask, Claude or
 * the web side by side with Incline's. Nothing changes until Apply; every
 * apply is undoable here and in AI activity.
 */
export default function ProgressionScreen() {
  const { key: rawKey } = useLocalSearchParams<{ key: string }>();
  const key = decodeURIComponent(rawKey ?? '');
  const router = useRouter();
  const { toast } = useToast();
  const { data: review } = useProgressionReview();

  const finding = review?.findings.find((f) => f.exerciseKey === key) ?? null;
  const pending = review?.inbox.find((d) => d.exerciseKey === key) ?? null;
  const history = (review?.decisions ?? []).filter((d) => d.exerciseKey === key);
  const lift = review?.lifts.find((l) => l.key === key) ?? null;
  const exerciseId = review?.idByKey.get(key) ?? null;
  const unit = review?.unit ?? 'metric';
  const name = finding?.name ?? lift?.name ?? pending?.exerciseName ?? history[0]?.exerciseName ?? 'Lift';
  const { data: routines } = useRoutinesWithExercise(exerciseId);
  const applied = history.find((d) => d.status === 'applied' && (!finding || finding.status === 'applied')) ?? null;

  const options: FixOption[] = finding ? [finding.fix, ...finding.alternatives] : [];
  const [choice, setChoice] = useState<'pending' | number>(0);
  useEffect(() => setChoice(pending ? 'pending' : 0), [pending]);

  const selectedPlan: RemedyPlan | null = choice === 'pending' ? (pending?.params ?? null) : (options[choice]?.plan ?? null);
  const [subs, setSubs] = useState<Exercise[]>([]);
  const [substitute, setSubstitute] = useState<Exercise | null>(null);
  const needsSub = selectedPlan?.remedy === 'swap' && !selectedPlan.substituteKey;
  useEffect(() => {
    if (!needsSub || !exerciseId) return;
    let live = true;
    void getExerciseSubstitutes(exerciseId, 5).then((list) => {
      if (!live) return;
      setSubs(list);
      setSubstitute((cur) => cur ?? list[0] ?? null);
    });
    return () => {
      live = false;
    };
  }, [needsSub, exerciseId]);

  const [busy, setBusy] = useState(false);
  const routineFix = selectedPlan && ['add_set', 'rep_range', 'swap'].includes(selectedPlan.remedy);
  const noRoutine = !!routineFix && (routines?.length ?? 0) === 0;

  const last = lift?.sessions[0];
  const assessment =
    pending?.params && last ? assessProposal(pending.params, finding, { topKg: last.weightKg, sets: last.sets ?? null }, unit) : null;

  const onApply = async () => {
    if (!selectedPlan || busy) return;
    if (selectedPlan.remedy === 'deload') {
      router.push('/deload' as Href);
      return;
    }
    setBusy(true);
    const fromPending = choice === 'pending' && pending;
    const res = await applyFix({
      exerciseKey: key,
      exerciseName: name,
      plan: selectedPlan,
      source: fromPending ? pending.source : 'user',
      rationale: fromPending ? pending.rationale : '',
      decisionUuid: fromPending ? pending.id : null,
      unit,
      substituteId: needsSub ? (substitute?.id ?? null) : null,
    }).catch((e: unknown) => ({ status: 'rejected' as const, reason: 'invalid_payload' as const, detail: e instanceof Error ? e.message : undefined }));
    setBusy(false);
    if (res.status !== 'applied') {
      toast({ title: 'Could not apply', description: res.detail ?? 'Try again.', variant: 'destructive' });
      return;
    }
    const uuid = (res.after as { decisionUuid?: string } | undefined)?.decisionUuid;
    toast({
      title: 'Fix applied',
      description: planText(selectedPlan, unit) ?? REMEDY_LABEL[selectedPlan.remedy],
      variant: 'success',
      action: uuid ? { label: 'Undo', onPress: () => void undoFix(uuid) } : undefined,
    });
  };

  const onDecline = async () => {
    if (busy) return;
    setBusy(true);
    const plan = selectedPlan ?? finding?.fix.plan ?? null;
    await declineFix({
      exerciseKey: key,
      exerciseName: name,
      remedy: plan?.remedy ?? 'reset',
      plan,
      decisionUuid: choice === 'pending' && pending ? pending.id : null,
    });
    setBusy(false);
    toast({ title: 'Okay, not now', description: 'We will look again after a few more sessions.', variant: 'info' });
    router.back();
  };

  const onUndo = async () => {
    if (!applied || busy) return;
    setBusy(true);
    const r = await undoFix(applied.id);
    setBusy(false);
    toast(
      r === 'reverted'
        ? { title: 'Undone', description: 'Your routines are back to how they were.', variant: 'success' }
        : { title: 'Nothing to undo', description: 'This fix was applied on another device; change it there or by hand.', variant: 'info' },
    );
  };

  if (!review) return <SafeAreaView className="flex-1 bg-background" edges={['bottom']} />;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={SCREEN_CONTENT} showsVerticalScrollIndicator={false}>
        <Text className="text-2xl font-bold text-foreground">{name}</Text>
        <Caption className="mt-1">{headline(finding, unit)}</Caption>

        {finding ? (
          <Section title="Why" first={false}>
            <Card>
              <Body className="text-foreground">{finding.causeText}</Body>
            </Card>
          </Section>
        ) : null}

        {applied ? (
          <Section title="Applied">
            <Card className="gap-2">
              <Body className="text-foreground">{planText(applied.params, unit) ?? REMEDY_LABEL[applied.remedy]}</Body>
              <Caption>
                {decisionSourceLabel(applied.source)} · {new Date(applied.createdAt).toLocaleDateString()}
                {applied.params?.remedy === 'reset' ? ' · used on your next session' : ' · judged on the sessions after it'}
              </Caption>
              <Button size="sm" variant="outline" onPress={onUndo} disabled={busy}>
                Undo
              </Button>
            </Card>
          </Section>
        ) : null}

        {pending?.params ? (
          <Section title={`Suggested by ${decisionSourceLabel(pending.source)}`}>
            <Option
              selected={choice === 'pending'}
              onPress={() => setChoice('pending')}
              title={planText(pending.params, unit) ?? REMEDY_LABEL[pending.remedy]}
              body={pending.rationale ? `“${pending.rationale}”` : undefined}
              meta={assessment ? VERDICT_COPY[assessment.verdict] : undefined}
              badge={assessment?.verdict === 'matches' ? 'Matches' : undefined}
              disabled={assessment?.verdict === 'unsafe'}
            />
            {assessment?.verdict === 'unsafe' ? (
              <Caption className="mt-2 px-1 text-destructive">{assessment.problems.join('; ')}</Caption>
            ) : null}
          </Section>
        ) : null}

        {options.length && !applied ? (
          <Section title={pending ? "Incline's options" : 'Fixes'}>
            <View className="gap-2">
              {options.map((o, i) => (
                <Option
                  key={o.plan.remedy}
                  selected={choice === i}
                  onPress={() => setChoice(i)}
                  title={REMEDY_LABEL[o.plan.remedy]}
                  body={o.sentence}
                  meta={`Evidence ${o.evidence.grade} · ${o.evidence.source}`}
                  badge={i === 0 ? 'Incline pick' : undefined}
                />
              ))}
            </View>
          </Section>
        ) : null}

        {needsSub && !applied ? (
          <Section title="Swap to">
            <Card className="py-1">
              {subs.length === 0 ? <Caption className="py-3">No close variation in your library.</Caption> : null}
              {subs.map((s, i) => (
                <View key={s.id}>
                  {i > 0 ? <Separator /> : null}
                  <ListRow title={s.name} subtitle={s.equipment} onPress={() => setSubstitute(s)}>
                    {substitute?.id === s.id ? <Icon icon={Check} size={18} color="primary" /> : null}
                  </ListRow>
                </View>
              ))}
            </Card>
          </Section>
        ) : null}

        {selectedPlan && !applied ? (
          <Section title="What changes">
            <Caption className="px-1">{effectLine(selectedPlan, routines?.map((r) => r.name) ?? [], noRoutine)}</Caption>
            <View className="mt-4 gap-3">
              <Button onPress={onApply} disabled={busy || noRoutine || (needsSub && !substitute) || (assessment?.verdict === 'unsafe' && choice === 'pending')}>
                {selectedPlan.remedy === 'deload' ? 'Plan a deload week' : 'Apply'}
              </Button>
              <Button variant="outline" onPress={onDecline} disabled={busy}>
                Not now
              </Button>
            </View>
          </Section>
        ) : null}

        {!finding && !pending && !applied ? (
          <Section title="Status">
            <Caption className="px-1">This lift is moving again, or there is not enough recent training to judge it.</Caption>
          </Section>
        ) : null}

        {history.length ? (
          <Section title="History">
            <Card className="py-1">
              {history.slice(0, 8).map((d, i) => (
                <View key={d.id}>
                  {i > 0 ? <Separator /> : null}
                  <HistoryRow d={d} unit={unit} />
                </View>
              ))}
            </Card>
          </Section>
        ) : null}

        <Section title="About this rule">
          <Caption className="px-1">
            {`A plateau is ${PLATEAU_SESSIONS} sessions in a row without beating your best estimated 1RM. Incline's pick is a default from the evidence, not a rule: you, Ask or a connected AI can choose another fix. Changes past the safe range (more than a 30% cut, more than 10 sets) are made by hand. Rules ${finding?.ruleVersion ?? PROGRESSION_RULE_VERSION}.`}
          </Caption>
          <View className="mt-2 px-1">
            <AskAboutLink about={{ kind: 'insight', label: `Plateau: ${name}`.slice(0, 80) }} question={`What should I do about my ${name} plateau?`} />
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function headline(f: PlateauFinding | null, unit: 'metric' | 'imperial'): string {
  if (!f) return 'No plateau right now';
  return `${f.sessions} sessions without progress · best ${formatLoad(f.best.weightKg, unit)} × ${f.best.reps}`;
}

function effectLine(plan: RemedyPlan, routineNames: string[], noRoutine: boolean): string {
  if (plan.remedy === 'reset') return 'Your next session suggests the lighter load; after that, normal progression resumes.';
  if (plan.remedy === 'deload') return 'Opens the deload planner: a lighter copy of your routine for one week. Your routine is not changed.';
  if (noRoutine) return 'This lift is not in a routine yet. Add it to one, then apply.';
  const list = routineNames.length <= 3 ? routineNames.join(', ') : `${routineNames.slice(0, 3).join(', ')} and ${routineNames.length - 3} more`;
  return `Updates ${list}. Undo puts them back exactly.`;
}

function Option({
  selected,
  onPress,
  title,
  body,
  meta,
  badge,
  disabled,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  body?: string;
  meta?: string;
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      className={`gap-1 rounded-2xl border px-4 py-3 ${selected ? 'border-primary bg-primary/5' : 'border-hairline bg-surface1'}`}>
      <View className="flex-row items-center justify-between gap-2">
        <Body className="flex-1 font-semibold text-foreground">{title}</Body>
        {badge ? <Badge variant={badge === 'Matches' ? 'success' : 'default'}>{badge}</Badge> : null}
      </View>
      {body ? <Body className="text-foreground">{body}</Body> : null}
      {meta ? <Caption>{meta}</Caption> : null}
    </Tappable>
  );
}

function HistoryRow({ d, unit }: { d: StoredDecision; unit: 'metric' | 'imperial' }) {
  const change = planText(d.params, unit) ?? REMEDY_LABEL[d.remedy];
  return (
    <ListRow title={change} subtitle={`${decisionSourceLabel(d.source)} · ${new Date(d.createdAt).toLocaleDateString()}`}>
      <Caption>{DECISION_STATUS_LABEL[d.status]}</Caption>
    </ListRow>
  );
}
