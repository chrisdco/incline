import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronDown, ChevronUp, TriangleAlert } from 'lucide-react-native';

import { applyAiAction, recordAiFeedback, revertAiActivity } from '@/ai/activity';
import { PROGRAM_CREATE_PLAN, registerPlanActions, type PlanCreateResult } from '@/ai/plan-actions';
import { requestPlanBuild, type PlanProposal } from '@/ai/plan-build-client';
import type { AiFailure } from '@/ai/types';
import { useAppAuth } from '@/auth/use-app-auth';
import { AiFallbackNotice } from '@/components/ai/ai-fallback-notice';
import { AiMark } from '@/components/ai/ai-mark';
import { AiThinking } from '@/components/ai/ai-thinking';
import { ProposalCard } from '@/components/ai/proposal-card';
import { SuggestionChip } from '@/components/ai/suggestion-chip';
import { Chip } from '@/components/common/chip';
import { Icon } from '@/components/common/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Body, Caption, Text } from '@/components/common/text';
import { SectionLabel } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tappable } from '@/components/ui/tappable';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { BEGINNER_MAX_DAYS, MAX_PLAN_INTENT, type PlanBuildInput, type PlanEquipment } from '@/contracts/plans/plan-build';
import { MAJOR_MUSCLES, PLAN_PRESETS, type PlanExperience, type PlanGoal } from '@/contracts/plans/rules';
import { setActiveProgram } from '@/db/queries/programs';
import type { Goal } from '@/db/types';
import { useProfile } from '@/hooks/use-data';
import { cn } from '@/lib/cn';
import { captureError } from '@/lib/error-sink';
import { SCREEN_CONTENT } from '@/lib/layout';

/**
 * "Build a plan by asking" (PROGRAMMING.md §6). Fitbod/Juggernaut-style:
 * the user picks the frame (length, days, goal, level, time, kit) with chips
 * and adds a line of intent; code lays out the research-backed structure and
 * the AI only picks exercises. Nothing is written until Save.
 */
const TASK = 'plan_build';
const STARTERS = ['Winter Arc: 8 weeks to get bigger', 'Bigger arms and shoulders', 'Bad knees, go easy on squats'] as const;
const THINKING = ['Laying out the weeks', 'Picking exercises', 'Checking weekly volume'] as const;
const DAYS = [2, 3, 4, 5, 6] as const;
const MINUTES = [30, 45, 60, 75, 90] as const;
const GOALS: { value: PlanGoal; label: string }[] = [
  { value: 'hypertrophy', label: 'Build muscle' },
  { value: 'strength', label: 'Get stronger' },
  { value: 'general', label: 'General fitness' },
];
const LEVELS: { value: PlanExperience; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];
const KITS: { label: string; equipment: PlanEquipment[] | undefined }[] = [
  { label: 'Full gym', equipment: undefined },
  { label: 'Dumbbells', equipment: ['dumbbell', 'bodyweight'] },
  { label: 'Home kit', equipment: ['dumbbell', 'bodyweight', 'band', 'kettlebell'] },
  { label: 'Bodyweight', equipment: ['bodyweight', 'band'] },
];
const WEEKDAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MUSCLE_LABEL: Record<string, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
};

function goalFromProfile(goal: Goal | undefined): PlanGoal {
  return goal === 'gain_strength' ? 'strength' : goal === 'build_muscle' || goal === undefined ? 'hypertrophy' : 'general';
}

function reps(r: { repsMin: number; repsMax: number }): string {
  return r.repsMin === r.repsMax ? `${r.repsMin}` : `${r.repsMin}–${r.repsMax}`;
}

/** "Wk 1–3 build · Wk 4 deload", run-length over the weeks. */
function phases(p: PlanProposal): string {
  const out: string[] = [];
  let start = 0;
  for (let i = 1; i <= p.weeks.length; i++) {
    if (i === p.weeks.length || p.weeks[i]!.kind !== p.weeks[start]!.kind) {
      const a = p.weeks[start]!.week;
      const b = p.weeks[i - 1]!.week;
      out.push(`Wk ${a === b ? a : `${a}–${b}`} ${p.weeks[start]!.kind}`);
      start = i;
    }
  }
  return out.join(' · ');
}

function PlanPreview({ proposal }: { proposal: PlanProposal }) {
  const byKey = new Map(proposal.days.map((d) => [d.key, d]));
  return (
    <View className="gap-4">
      <View className="gap-1">
        <Caption className="tabular-nums">{phases(proposal)}</Caption>
        <Caption>{proposal.week.map((w) => `${WEEKDAY[w.weekday]} ${byKey.get(w.key)?.name ?? ''}`).join(' · ')}</Caption>
      </View>
      {proposal.days.map((d) => (
        <View key={d.key} className="gap-1.5">
          <View className="flex-row items-baseline justify-between gap-2">
            <Body className="min-w-0 flex-1 font-semibold text-foreground">{d.name}</Body>
            <Caption className="tabular-nums">{`~${d.minutes} min`}</Caption>
          </View>
          {d.rows.map((r) => (
            <View key={`${d.key}-${r.exerciseId}`} className="flex-row items-baseline justify-between gap-3">
              <Text className="min-w-0 flex-1 text-sm text-foreground">{r.exercise}</Text>
              <Text className="text-sm text-muted-foreground tabular-nums">{`${r.sets} × ${reps(r)}`}</Text>
            </View>
          ))}
        </View>
      ))}
      <View className="gap-1">
        <Caption className="font-medium text-foreground">Hard sets a week</Caption>
        <Caption className="tabular-nums">
          {MAJOR_MUSCLES.map((m) => `${MUSCLE_LABEL[m]} ${Math.round(proposal.weekly[m] ?? 0)}`).join(' · ')}
        </Caption>
      </View>
      {proposal.warnings.length || proposal.unresolved.length || proposal.offEquipment.length ? (
        <View className="flex-row items-start gap-2">
          <Icon icon={TriangleAlert} size={14} color="muted-foreground" />
          <Caption className="min-w-0 flex-1">
            {[
              proposal.warnings.length ? `Outside the usual range: ${proposal.warnings.join(', ')}.` : '',
              proposal.unresolved.length ? `Left out (not in your exercise list): ${proposal.unresolved.join(', ')}.` : '',
              proposal.offEquipment.length ? `Left out (needs other equipment): ${proposal.offEquipment.join(', ')}.` : '',
            ]
              .filter(Boolean)
              .join(' ')}
          </Caption>
        </View>
      ) : null}
    </View>
  );
}

/** Module-level so the component stays free of try blocks (React Compiler). */
async function savePlan(proposal: PlanProposal): Promise<{ activityId: number; programId: number } | null> {
  if (!proposal.payload) return null;
  try {
    registerPlanActions();
    const res = await applyAiAction({
      proposalId: proposal.proposalId,
      task: TASK,
      action: { type: PROGRAM_CREATE_PLAN, payload: proposal.payload },
    });
    if (res.status !== 'applied') return null;
    return { activityId: res.activityId, programId: (res.after as PlanCreateResult).programId };
  } catch (err) {
    captureError(err, { where: 'plan-builder.save' });
    return null;
  }
}

type State =
  | { kind: 'form' }
  | { kind: 'thinking' }
  | { kind: 'proposal'; proposal: PlanProposal }
  | { kind: 'declined'; message: string }
  | { kind: 'failed'; reason: AiFailure }
  | { kind: 'saved'; programId: number; name: string; started: boolean };

/**
 * One line of the setup list: label left, current value right. Tapping opens
 * that row's choices in place (one row at a time), so the form stays a short
 * summary until the user wants to change something.
 */
function SetupRow<T extends string | number>({
  label,
  options,
  value,
  onChange,
  open,
  onToggle,
  first,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  open: boolean;
  onToggle: () => void;
  first?: boolean;
}) {
  const current = options.find((o) => o.value === value)?.label ?? '';
  return (
    <View className={cn(!first && 'border-t border-divider')}>
      <Tappable
        onPress={onToggle}
        pressedOpacity={0.6}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}: ${current}`}
        className="flex-row items-center gap-3 px-4 py-3.5">
        <Body className="flex-1 text-foreground">{label}</Body>
        <Body className={cn('tabular-nums', open ? 'text-primary-text' : 'text-muted-foreground')}>{current}</Body>
        <Icon icon={open ? ChevronUp : ChevronDown} size={16} color="muted-foreground" />
      </Tappable>
      {open ? (
        <View className="flex-row flex-wrap gap-1.5 px-4 pb-4">
          {options.map((o) => (
            <Chip
              key={String(o.value)}
              size="sm"
              label={o.label}
              selected={o.value === value}
              onPress={() => {
                onChange(o.value);
                onToggle();
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function PlanBuilderScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const { userId, getToken } = useAppAuth();
  const profile = useProfile();
  const [intent, setIntent] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [days, setDays] = useState(4);
  const [goalPick, setGoal] = useState<PlanGoal | null>(null);
  const [levelPick, setLevel] = useState<PlanExperience | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [kit, setKit] = useState(0);
  const [variant, setVariant] = useState(0);
  const [state, setState] = useState<State>({ kind: 'form' });
  const [saving, setSaving] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const toggle = (row: string) => setOpenRow((o) => (o === row ? null : row));
  const abort = useRef<AbortController | null>(null);

  const goal = goalPick ?? goalFromProfile(profile.data?.goal);
  const level = levelPick ?? profile.data?.experienceLevel ?? 'intermediate';
  const dayCount = level === 'beginner' ? Math.min(days, BEGINNER_MAX_DAYS) : days;
  const dayOptions = DAYS.filter((d) => level !== 'beginner' || d <= BEGINNER_MAX_DAYS);

  const build = async (text: string, attempt: number) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ kind: 'thinking' });
    const equipment = KITS[kit]?.equipment;
    const plan: Omit<PlanBuildInput, 'catalog'> = {
      intent: text.trim(),
      weeks,
      daysPerWeek: dayCount,
      goal,
      experience: level,
      minutes,
      ...(equipment ? { equipment } : {}),
      ...(attempt ? { variant: attempt } : {}),
    };
    const outcome = await requestPlanBuild({ plan, getToken, userId, signal: controller.signal });
    if (controller.signal.aborted) return;
    if (outcome.status === 'proposal') setState({ kind: 'proposal', proposal: outcome.proposal });
    else if (outcome.status === 'declined') setState({ kind: 'declined', message: outcome.message });
    else setState({ kind: 'failed', reason: outcome.reason });
  };

  const start = (text: string) => {
    setIntent(text);
    setVariant(0);
    void build(text, 0);
  };

  const again = (proposal: PlanProposal) => {
    void recordAiFeedback({ proposalId: proposal.proposalId, task: TASK, outcome: 'regenerated' });
    const next = (variant % 9) + 1;
    setVariant(next);
    void build(intent, next);
  };

  const save = async (proposal: PlanProposal) => {
    setSaving(true);
    const saved = await savePlan(proposal);
    setSaving(false);
    if (!saved) {
      toast({ title: 'Could not save the plan', variant: 'destructive' });
      return;
    }
    setState({ kind: 'saved', programId: saved.programId, name: proposal.name, started: false });
    toast({
      title: 'Plan saved',
      description: proposal.name,
      variant: 'success',
      action: {
        label: 'Undo',
        onPress: () => {
          void revertAiActivity(saved.activityId)
            .then(() => setState({ kind: 'proposal', proposal }))
            .catch((err: unknown) => captureError(err, { where: 'plan-builder.undo' }));
        },
      },
    });
  };

  const startPlan = (programId: number, name: string) => {
    void setActiveProgram(programId)
      .then(() => {
        setState({ kind: 'saved', programId, name, started: true });
        toast({ title: `${name} is your active plan`, variant: 'success' });
      })
      .catch((err: unknown) => captureError(err, { where: 'plan-builder.start' }));
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pb-2 pt-3">
        <IconButton icon={ArrowLeft} accessibilityLabel="Go back" onPress={() => router.back()} className="-my-1.5 -ml-2" />
        <Body className="text-base font-semibold text-foreground">Build a plan</Body>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ ...SCREEN_CONTENT, paddingBottom: 40 }}>
        {state.kind === 'thinking' ? (
          <AiThinking steps={THINKING} onManual={() => setState({ kind: 'form' })} />
        ) : state.kind === 'proposal' ? (
          <View className="gap-3">
            <ProposalCard
              title={state.proposal.name}
              basis={state.proposal.summary}
              applying={saving}
              applyLabel={state.proposal.payload ? 'Save plan' : 'Nothing to save'}
              onApply={() => void save(state.proposal)}
              onRegenerate={() => again(state.proposal)}
              onReject={(reason) => {
                void recordAiFeedback({ proposalId: state.proposal.proposalId, task: TASK, outcome: 'rejected', reason: reason ?? undefined });
                setState({ kind: 'form' });
              }}>
              <PlanPreview proposal={state.proposal} />
            </ProposalCard>
            <Chip label="Change the setup" size="sm" onPress={() => setState({ kind: 'form' })} />
          </View>
        ) : state.kind === 'saved' ? (
          <Card>
            <View className="gap-3 py-3">
              <Body className="font-semibold text-foreground">{state.name}</Body>
              <Caption>
                {state.started
                  ? 'Active now. Home shows today’s workout from this plan.'
                  : 'Saved to My programs with its routines. Start it to follow it from Home.'}
              </Caption>
              {!state.started ? (
                <Button size="sm" onPress={() => startPlan(state.programId, state.name)}>
                  Start this plan
                </Button>
              ) : null}
              <View className="flex-row flex-wrap gap-2">
                <Chip label="Open plan" size="sm" onPress={() => router.replace(`/program/${state.programId}` as Href)} />
                <Chip label="Build another" size="sm" onPress={() => setState({ kind: 'form' })} />
              </View>
            </View>
          </Card>
        ) : (
          <View className="gap-5">
            <View className="gap-2">
              <View className="flex-row items-center gap-2">
                <Icon icon={AiMark} size={16} color="primary" />
                <Body className="font-semibold text-foreground">What are you training for?</Body>
              </View>
              <Input
                className="bg-surface1"
                value={intent}
                onChangeText={setIntent}
                placeholder="e.g. Winter Arc, bigger chest, sore lower back"
                maxLength={MAX_PLAN_INTENT}
                returnKeyType="done"
                accessibilityLabel="Describe your plan"
              />
              {!intent ? (
                <View className="flex-row flex-wrap gap-2">
                  {STARTERS.map((s) => (
                    <SuggestionChip key={s} label={s} onPress={() => setIntent(s)} />
                  ))}
                </View>
              ) : null}
            </View>
            <View className="gap-2">
              <SectionLabel>Your setup</SectionLabel>
              <Card className="p-0">
                <SetupRow first label="Length" options={PLAN_PRESETS.map((p) => ({ value: p.weeks, label: p.label }))} value={weeks} onChange={setWeeks} open={openRow === 'weeks'} onToggle={() => toggle('weeks')} />
                <SetupRow label="Days a week" options={dayOptions.map((d) => ({ value: d, label: `${d} days` }))} value={dayCount} onChange={setDays} open={openRow === 'days'} onToggle={() => toggle('days')} />
                <SetupRow label="Goal" options={GOALS} value={goal} onChange={setGoal} open={openRow === 'goal'} onToggle={() => toggle('goal')} />
                <SetupRow label="Level" options={LEVELS} value={level} onChange={setLevel} open={openRow === 'level'} onToggle={() => toggle('level')} />
                <SetupRow label="Session" options={MINUTES.map((m) => ({ value: m, label: `${m} min` }))} value={minutes} onChange={setMinutes} open={openRow === 'minutes'} onToggle={() => toggle('minutes')} />
                <SetupRow label="Equipment" options={KITS.map((k, i) => ({ value: i, label: k.label }))} value={kit} onChange={setKit} open={openRow === 'kit'} onToggle={() => toggle('kit')} />
              </Card>
            </View>
            {level === 'beginner' ? <Caption>Beginners grow fastest on 2–4 days with full recovery between sessions.</Caption> : null}
            {state.kind === 'declined' ? <Caption>{state.message}</Caption> : null}
            {state.kind === 'failed' ? <AiFallbackNotice reason={state.reason} onRetry={() => void build(intent, variant)} /> : null}
            <Button onPress={() => start(intent)} leftIcon={<Icon icon={AiMark} size={16} color="primary-foreground" />}>
              Build my plan
            </Button>
            <Caption className="text-center">Based on training research. You review it before anything is saved.</Caption>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
