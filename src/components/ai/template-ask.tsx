import { useRef, useState } from 'react';
import { View } from 'react-native';
import { ArrowUp, Sparkles } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption, Text } from '@/components/common/text';
import { Input } from '@/components/ui/input';
import { Tappable } from '@/components/ui/tappable';
import { useToast } from '@/components/ui/toast';
import { useAppAuth } from '@/auth/use-app-auth';
import { applyAiAction, recordAiFeedback, revertAiActivity } from '@/ai/activity';
import { registerTemplateActions, TEMPLATE_APPLY_DIFF, TEMPLATE_CREATE_COPY, type CopyResult } from '@/ai/template-actions';
import {
  buildTemplateProposal,
  requestTemplateEdit,
  type ProposalContext,
  type ProposalRow,
  type TemplateProposal,
} from '@/ai/template-edit-client';
import { Chip } from '@/components/common/chip';
import { ExercisePickerSheet } from '@/components/workout/exercise-picker-sheet';
import type { AiFailure } from '@/ai/types';
import { captureError } from '@/lib/error-sink';
import { cn } from '@/lib/cn';
import type { WorkoutTemplate } from '@/db/types';

import { AiFallbackNotice } from './ai-fallback-notice';
import { AiThinking } from './ai-thinking';
import { ProposalCard } from './proposal-card';
import { SuggestionChip } from './suggestion-chip';

const STARTERS = ['Make it 45 minutes', 'Easier on my shoulders', 'Home version, dumbbells only'] as const;
const DRAFT_STARTERS = ['Push day, 45 minutes', 'Full body, dumbbells only', 'Leg day, no squat rack'] as const;
const THINKING = ['Reading your routine', 'Picking exercises', 'Checking the time'] as const;
const TASK = 'template_edit';

function reps(row: { repsMin: number | null; repsMax: number | null }): string {
  if (row.repsMin === null) return '';
  return row.repsMax !== null && row.repsMax !== row.repsMin ? ` × ${row.repsMin}–${row.repsMax}` : ` × ${row.repsMin}`;
}

/**
 * Diff anatomy (Hevy/Strong have no AI edit; this follows the iOS "suggested
 * change" pattern): + added in success, ↻ swapped shows the old name, changed
 * targets in the accent, − removed struck through. Kept rows stay muted so
 * the new routine reads top to bottom.
 */
function DiffRow({ row }: { row: ProposalRow }) {
  const mark = row.status === 'added' ? '+' : row.status === 'replaced' ? '↻' : row.status === 'changed' ? '•' : ' ';
  const tone =
    row.status === 'added' ? 'text-success' : row.status === 'kept' ? 'text-muted-foreground' : 'text-primary-text';
  return (
    <View className="flex-row gap-2">
      <Text className={cn('w-4 text-sm font-semibold', tone)}>{mark}</Text>
      <View className="min-w-0 flex-1">
        <Text className={cn('text-sm', row.status === 'kept' ? 'text-muted-foreground' : 'font-medium text-foreground')}>
          {row.name}
          <Text className="text-sm text-muted-foreground tabular-nums">{` ${row.sets} sets${reps(row)}`}</Text>
        </Text>
        {row.replacedName ? <Caption>instead of {row.replacedName}</Caption> : null}
      </View>
    </View>
  );
}

function ProposalBody({ proposal, onPick }: { proposal: TemplateProposal; onPick: (name: string) => void }) {
  return (
    <View className="gap-2">
      {proposal.rows.map((row, i) => (
        <DiffRow key={`${row.ref ?? 'new'}-${i}`} row={row} />
      ))}
      {proposal.removed.map((name) => (
        <View key={`rm-${name}`} className="flex-row gap-2">
          <Text className="w-4 text-sm font-semibold text-destructive">−</Text>
          <Text className="flex-1 text-sm text-muted-foreground line-through">{name}</Text>
        </View>
      ))}
      <Caption className="tabular-nums">
        About {proposal.minutesBefore} → {proposal.minutesAfter} min
        {proposal.name ? ` · ${proposal.name}` : ''}
      </Caption>
      {proposal.copy ? <Caption>Saved as a new routine. This one stays as it is.</Caption> : null}
      {proposal.unresolved.length ? (
        <View className="gap-2">
          <Caption>Not in your exercise list yet. Pick one, or it stays out:</Caption>
          <View className="flex-row flex-wrap gap-2">
            {proposal.unresolved.map((name) => (
              <Chip key={name} label={`Pick “${name}”`} onPress={() => onPick(name)} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Module-level so the component stays free of try blocks (React Compiler). */
async function applyProposal(proposal: TemplateProposal): Promise<{ activityId: number; copyId: number | null } | null> {
  if (!proposal.payload) return null;
  try {
    registerTemplateActions();
    const res = await applyAiAction({
      proposalId: proposal.proposalId,
      task: TASK,
      action: { type: proposal.copy ? TEMPLATE_CREATE_COPY : TEMPLATE_APPLY_DIFF, payload: proposal.payload },
    });
    if (res.status !== 'applied') return null;
    return { activityId: res.activityId, copyId: proposal.copy ? (res.after as CopyResult).templateId : null };
  } catch (err) {
    captureError(err, { where: 'template-ask.apply' });
    return null;
  }
}

type State =
  | { kind: 'idle' }
  | { kind: 'thinking' }
  | { kind: 'proposal'; proposal: TemplateProposal; context: ProposalContext }
  | { kind: 'declined'; message: string }
  | { kind: 'created'; templateId: number; name: string }
  | { kind: 'failed'; reason: AiFailure };

/**
 * "Change this routine by asking" — nothing is written until Apply. With
 * `onDraft` (a routine not saved yet) the proposal fills the editor instead,
 * and Create routine saves it like any hand-built one.
 */
export function TemplateAsk({
  template,
  onChanged,
  onDraft,
  onOpenRoutine,
}: {
  template: WorkoutTemplate;
  onChanged?: () => void;
  onDraft?: (proposal: TemplateProposal) => void;
  /** Opens a routine the AI just created (versions are saved as copies). */
  onOpenRoutine?: (templateId: number) => void;
}) {
  const drafting = Boolean(onDraft);
  const { userId, getToken } = useAppAuth();
  const { toast } = useToast();
  const [intent, setIntent] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [applying, setApplying] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const [picking, setPicking] = useState<string | null>(null);

  const pick = (exercise: { id: number; name: string }) => {
    const name = picking;
    setPicking(null);
    if (!name || state.kind !== 'proposal') return;
    const { context } = state;
    const resolved = new Map(context.resolved).set(name, { id: exercise.id, name: exercise.name });
    const next = { ...context, resolved };
    const proposal = buildTemplateProposal(next.template, next.input, next.diff, resolved, state.proposal.proposalId);
    setState({ kind: 'proposal', proposal, context: next });
  };

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setIntent(trimmed);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setState({ kind: 'thinking' });
    const outcome = await requestTemplateEdit({ template, intent: trimmed, getToken, userId, signal: controller.signal });
    if (controller.signal.aborted) return;
    if (outcome.status === 'proposal') setState({ kind: 'proposal', proposal: outcome.proposal, context: outcome.context });
    else if (outcome.status === 'declined') setState({ kind: 'declined', message: outcome.message });
    else setState({ kind: 'failed', reason: outcome.reason });
  };

  const cancel = () => {
    abort.current?.abort();
    setState({ kind: 'idle' });
  };

  const apply = async (proposal: TemplateProposal) => {
    if (!proposal.payload) return;
    if (onDraft) {
      onDraft(proposal);
      setState({ kind: 'idle' });
      setIntent('');
      return;
    }
    setApplying(true);
    const applied = await applyProposal(proposal);
    setApplying(false);
    if (applied === null) {
      toast({ title: 'Could not apply that change', variant: 'destructive' });
      return;
    }
    const { activityId, copyId } = applied;
    setIntent('');
    if (copyId !== null) setState({ kind: 'created', templateId: copyId, name: proposal.name });
    else {
      setState({ kind: 'idle' });
      onChanged?.();
    }
    toast({
      title: copyId !== null ? 'New routine saved' : 'Routine updated',
      description: copyId !== null ? proposal.name : proposal.summary,
      variant: 'success',
      action: {
        label: 'Undo',
        onPress: () => {
          void revertAiActivity(activityId)
            .then(() => (copyId !== null ? setState({ kind: 'idle' }) : onChanged?.()))
            .catch((err: unknown) => captureError(err, { where: 'template-ask.undo' }));
        },
      },
    });
  };

  const reject = (proposal: TemplateProposal, reason: string | null) => {
    void recordAiFeedback({ proposalId: proposal.proposalId, task: TASK, outcome: 'rejected', reason: reason ?? undefined });
    setState({ kind: 'idle' });
  };

  const retry = () => void ask(intent);

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Icon icon={Sparkles} size={16} color="primary" />
        <Body className="font-semibold text-foreground">{drafting ? 'Build it by asking' : 'Change it by asking'}</Body>
      </View>

      {state.kind === 'thinking' ? (
        <AiThinking steps={THINKING} onManual={cancel} />
      ) : state.kind === 'proposal' ? (
        <ProposalCard
          title={state.proposal.summary}
          basis={`“${intent}”`}
          applying={applying}
          applyLabel={
            !state.proposal.payload ? 'Nothing to apply' : drafting ? 'Use this' : state.proposal.copy ? 'Save as new routine' : 'Apply'
          }
          onApply={() => void apply(state.proposal)}
          onRegenerate={() => {
            void recordAiFeedback({ proposalId: state.proposal.proposalId, task: TASK, outcome: 'regenerated' });
            retry();
          }}
          onReject={(reason) => reject(state.proposal, reason)}>
          <ProposalBody proposal={state.proposal} onPick={setPicking} />
        </ProposalCard>
      ) : state.kind === 'created' ? (
        <View className="gap-2">
          <Caption>Saved “{state.name}”. This routine is unchanged.</Caption>
          <View className="flex-row flex-wrap gap-2">
            {onOpenRoutine ? <Chip label={`Open ${state.name}`} onPress={() => onOpenRoutine(state.templateId)} /> : null}
            <Chip label="Ask something else" onPress={() => setState({ kind: 'idle' })} />
          </View>
        </View>
      ) : (
        <>
          <View className="flex-row items-center gap-2">
            <Input
              className="flex-1 bg-surface1"
              value={intent}
              onChangeText={setIntent}
              placeholder={drafting ? 'e.g. Push day, 45 min, dumbbells' : 'e.g. Cut it to 45 minutes'}
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
              {(drafting ? DRAFT_STARTERS : STARTERS).map((s) => (
                <SuggestionChip key={s} label={s} onPress={() => void ask(s)} />
              ))}
            </View>
          ) : null}
        </>
      )}
      <ExercisePickerSheet
        open={picking !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        onPick={pick}
        title={picking ? `Instead of “${picking}”` : undefined}
      />
    </View>
  );
}
