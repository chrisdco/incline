import { useRef, useState } from 'react';
import { View } from 'react-native';
import { ArrowUp } from 'lucide-react-native';
import { AiMark } from './ai-mark';

import { Icon } from '@/components/common/icon';
import { Body, Caption, Text } from '@/components/common/text';
import { Input } from '@/components/ui/input';
import { Tappable } from '@/components/ui/tappable';
import { useToast } from '@/components/ui/toast';
import { useAppAuth } from '@/auth/use-app-auth';
import { applyAiAction, recordAiFeedback, revertAiActivity } from '@/ai/activity';
import { PROGRAM_APPLY_EDIT, registerPlanActions } from '@/ai/plan-actions';
import { requestPlanEdit, type PlanEditProposal } from '@/ai/plan-edit-client';
import type { AiFailure } from '@/ai/types';
import { captureError } from '@/lib/error-sink';
import { cn } from '@/lib/cn';
import type { Program } from '@/db/types';

import { AiFallbackNotice } from './ai-fallback-notice';
import { AiThinking } from './ai-thinking';
import { ProposalCard } from './proposal-card';
import { SuggestionChip } from './suggestion-chip';

const STARTERS = ['Move Friday to Saturday', 'Make it 2 weeks longer', 'Only 3 days a week'] as const;
const THINKING = ['Reading your plan', 'Moving things around', 'Checking the weeks'] as const;
const TASK = 'plan_edit';

/**
 * Same diff language as the routine edit (TemplateAsk): changed lines in the
 * foreground with a dot, unchanged lines muted, ↻ for swapped exercises.
 */
function ProposalBody({ proposal }: { proposal: PlanEditProposal }) {
  return (
    <View className="gap-2">
      {proposal.schedule?.map((line) => (
        <View key={line.label} className="flex-row gap-2">
          <Text className={cn('w-4 text-sm font-semibold', line.changed ? 'text-primary-text' : 'text-muted-foreground')}>
            {line.changed ? '•' : ' '}
          </Text>
          <View className="min-w-0 flex-1">
            <Caption className="tabular-nums">{line.label}</Caption>
            <Text className={cn('text-sm', line.changed ? 'font-medium text-foreground' : 'text-muted-foreground')}>{line.days}</Text>
          </View>
        </View>
      ))}
      {proposal.swaps.map((s) => (
        <View key={`${s.from}-${s.to}`} className="flex-row gap-2">
          <Text className="w-4 text-sm font-semibold text-primary-text">↻</Text>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-medium text-foreground">{s.to}</Text>
            <Caption>
              instead of {s.from} · {s.routines.join(', ')}
            </Caption>
          </View>
        </View>
      ))}
      {proposal.weeksAfter !== proposal.weeksBefore ? (
        <Caption className="tabular-nums">
          {proposal.weeksBefore} → {proposal.weeksAfter} weeks
        </Caption>
      ) : null}
      {proposal.renamed ? <Caption>Renamed to “{proposal.name}”</Caption> : null}
      {proposal.swaps.length ? <Caption>Swaps change the workout everywhere it is used.</Caption> : null}
      {proposal.unresolved.length ? (
        <Caption>Not in your exercise list, left out: {proposal.unresolved.join(', ')}</Caption>
      ) : null}
    </View>
  );
}

/** Module-level so the component stays free of try blocks (React Compiler). */
async function applyProposal(proposal: PlanEditProposal): Promise<number | null> {
  if (!proposal.payload) return null;
  try {
    registerPlanActions();
    const res = await applyAiAction({
      proposalId: proposal.proposalId,
      task: TASK,
      action: { type: PROGRAM_APPLY_EDIT, payload: proposal.payload },
    });
    return res.status === 'applied' ? res.activityId : null;
  } catch (err) {
    captureError(err, { where: 'plan-ask.apply' });
    return null;
  }
}

type State =
  | { kind: 'idle' }
  | { kind: 'thinking' }
  | { kind: 'proposal'; proposal: PlanEditProposal }
  | { kind: 'declined'; message: string }
  | { kind: 'failed'; reason: AiFailure };

/** "Change this plan by asking" (custom plans). Nothing is written until Apply. */
export function PlanAsk({ program, onChanged }: { program: Program; onChanged?: () => void }) {
  const { userId, getToken } = useAppAuth();
  const { toast } = useToast();
  const [intent, setIntent] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [applying, setApplying] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setIntent(trimmed);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ kind: 'thinking' });
    const outcome = await requestPlanEdit({ program, intent: trimmed, getToken, userId, signal: controller.signal });
    if (controller.signal.aborted) return;
    if (outcome.status === 'proposal') setState({ kind: 'proposal', proposal: outcome.proposal });
    else if (outcome.status === 'declined') setState({ kind: 'declined', message: outcome.message });
    else setState({ kind: 'failed', reason: outcome.reason });
  };

  const cancel = () => {
    abort.current?.abort();
    setState({ kind: 'idle' });
  };

  const apply = async (proposal: PlanEditProposal) => {
    if (!proposal.payload) return;
    setApplying(true);
    const activityId = await applyProposal(proposal);
    setApplying(false);
    if (activityId === null) {
      toast({ title: 'Could not apply that change', variant: 'destructive' });
      return;
    }
    setIntent('');
    setState({ kind: 'idle' });
    onChanged?.();
    toast({
      title: 'Plan updated',
      description: proposal.summary,
      variant: 'success',
      action: {
        label: 'Undo',
        onPress: () => {
          void revertAiActivity(activityId)
            .then(() => onChanged?.())
            .catch((err: unknown) => captureError(err, { where: 'plan-ask.undo' }));
        },
      },
    });
  };

  const reject = (proposal: PlanEditProposal, reason: string | null) => {
    void recordAiFeedback({ proposalId: proposal.proposalId, task: TASK, outcome: 'rejected', reason: reason ?? undefined });
    setState({ kind: 'idle' });
  };

  const retry = () => void ask(intent);

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Icon icon={AiMark} size={16} color="primary" />
        <Body className="font-semibold text-foreground">Change it by asking</Body>
      </View>

      {state.kind === 'thinking' ? (
        <AiThinking steps={THINKING} onManual={cancel} />
      ) : state.kind === 'proposal' ? (
        <ProposalCard
          title={state.proposal.summary}
          basis={`“${intent}”`}
          applying={applying}
          applyLabel={state.proposal.payload ? 'Apply' : 'Nothing to apply'}
          onApply={() => void apply(state.proposal)}
          onRegenerate={() => {
            void recordAiFeedback({ proposalId: state.proposal.proposalId, task: TASK, outcome: 'regenerated' });
            retry();
          }}
          onReject={(reason) => reject(state.proposal, reason)}>
          <ProposalBody proposal={state.proposal} />
        </ProposalCard>
      ) : (
        <>
          <View className="flex-row items-center gap-2">
            <Input
              className="flex-1 bg-surface1"
              value={intent}
              onChangeText={setIntent}
              placeholder="e.g. Move legs to Saturday"
              returnKeyType="send"
              onSubmitEditing={() => void ask(intent)}
              maxLength={300}
              accessibilityLabel="Describe the change"
            />
            <Tappable
              onPress={() => void ask(intent)}
              disabled={!intent.trim()}
              pressedOpacity={0.55}
              accessibilityRole="button"
              accessibilityLabel="Ask"
              className={cn('h-12 w-12 items-center justify-center rounded-full bg-primary', !intent.trim() && 'opacity-40')}>
              <Icon icon={ArrowUp} size={20} color="primary-foreground" />
            </Tappable>
          </View>
          {state.kind === 'declined' ? <Caption>{state.message}</Caption> : null}
          {state.kind === 'failed' ? <AiFallbackNotice reason={state.reason} onRetry={retry} /> : null}
          {state.kind === 'idle' && !intent ? (
            <View className="flex-row flex-wrap gap-2">
              {STARTERS.map((s) => (
                <SuggestionChip key={s} label={s} onPress={() => void ask(s)} />
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
