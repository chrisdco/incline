import {
  applyDiffToRows,
  estimateMinutes,
  type DraftRow,
  type TemplateDiffOp,
  type TemplateEditInput,
} from '@/contracts/templates/template-edit';
import type { WorkoutTemplate } from '@/db/types';
import type { GetToken } from '@/sync/supabase-auth';

import type { TemplateApplyPayload } from './template-actions';
import type { AiEvent, AiFailure } from './types';

/** A proposed row, resolved against the catalog. `exerciseId` null = no catalog match. */
export interface ProposalRow extends DraftRow {
  exerciseId: number | null;
}

export interface TemplateProposal {
  proposalId: string;
  summary: string;
  name: string;
  rows: ProposalRow[];
  removed: string[];
  /** AI names with no catalog match; those rows are left out of the write. */
  unresolved: string[];
  minutesBefore: number;
  minutesAfter: number;
  /** null when nothing applicable is left (all unresolved, or no real change). */
  payload: TemplateApplyPayload | null;
}

/** Everything needed to rebuild the preview after the user picks an exercise by hand. */
export interface ProposalContext {
  template: WorkoutTemplate;
  input: TemplateEditInput;
  diff: { summary: string; ops: TemplateDiffOp[] };
  resolved: Map<string, ResolvedExercise | null>;
}

export interface ResolvedExercise {
  id: number;
  name: string;
}

export type TemplateEditOutcome =
  | { status: 'proposal'; proposal: TemplateProposal; context: ProposalContext }
  | { status: 'declined'; message: string }
  | { status: 'unavailable'; reason: AiFailure };

/** The routine as the model sees it: rows e1…eN in order, names only. */
export function templateEditInput(
  template: WorkoutTemplate,
  intent: string,
  extra?: { memory?: string[]; catalog?: string[] },
): TemplateEditInput {
  return {
    templateName: template.name,
    rows: (template.exercises ?? []).map((te, i) => ({
      ref: `e${i + 1}`,
      name: te.exercise?.name ?? 'Exercise',
      sets: te.targetSets,
      repsMin: te.targetRepsMin,
      repsMax: te.targetRepsMax,
    })),
    intent,
    ...(extra?.memory?.length ? { memory: extra.memory } : {}),
    ...(extra?.catalog?.length ? { catalog: extra.catalog } : {}),
  };
}

/** Pure: turns a draft into the preview rows + the action payload. */
export function buildTemplateProposal(
  template: WorkoutTemplate,
  input: TemplateEditInput,
  diff: { summary: string; ops: TemplateDiffOp[] },
  resolved: Map<string, ResolvedExercise | null>,
  proposalId: string,
): TemplateProposal {
  const draft = applyDiffToRows(input, diff.ops);
  const byRef = new Map((template.exercises ?? []).map((te, i) => [`e${i + 1}`, te]));
  const unresolved: string[] = [];
  const rows: ProposalRow[] = [];
  for (const row of draft.rows) {
    const existing = row.ref ? byRef.get(row.ref) : undefined;
    if (row.status === 'added' || row.status === 'replaced') {
      const hit = resolved.get(row.name) ?? null;
      if (!hit) {
        unresolved.push(row.name);
        // A replace we can't match keeps the original exercise.
        if (existing && row.status === 'replaced') {
          rows.push({ ...row, name: row.replacedName ?? row.name, status: 'kept', exerciseId: existing.exerciseId });
        }
        continue;
      }
      if (existing && hit.id === existing.exerciseId) {
        rows.push({ ...row, name: hit.name, status: 'kept', exerciseId: hit.id });
        continue;
      }
      rows.push({ ...row, name: hit.name, exerciseId: hit.id });
    } else {
      rows.push({ ...row, exerciseId: existing?.exerciseId ?? null });
    }
  }

  const stateRows = rows.flatMap((r) => {
    if (r.exerciseId === null) return [];
    const existing = r.ref ? byRef.get(r.ref) : undefined;
    const repsMin = r.repsMin ?? existing?.targetRepsMin ?? 8;
    const repsMax = Math.max(repsMin, r.repsMax ?? existing?.targetRepsMax ?? 12);
    return [{ ...(existing ? { id: existing.id } : {}), exerciseId: r.exerciseId, sets: r.sets, repsMin, repsMax }];
  });
  const current = (template.exercises ?? []).map((te) => ({
    id: te.id,
    exerciseId: te.exerciseId,
    sets: te.targetSets,
    repsMin: te.targetRepsMin,
    repsMax: te.targetRepsMax,
  }));
  const unchanged = draft.name === template.name && JSON.stringify(stateRows) === JSON.stringify(current);

  return {
    proposalId,
    summary: diff.summary,
    name: draft.name,
    rows,
    removed: draft.removed.map((r) => r.name),
    unresolved,
    minutesBefore: estimateMinutes(input.rows),
    minutesAfter: estimateMinutes(rows),
    payload:
      stateRows.length === 0 || unchanged
        ? null
        : { templateId: template.id, name: draft.name, rows: stateRows, summary: diff.summary },
  };
}

function supabaseToken(getToken: GetToken): () => Promise<string | null> {
  return async () => {
    try {
      const templated = await getToken({ template: 'supabase' });
      if (templated) return templated;
    } catch {
      // Template missing — try the default token.
    }
    try {
      return await getToken();
    } catch {
      return null;
    }
  };
}

async function reportEvent(event: AiEvent): Promise<void> {
  if (event.status === 'ok' || (event.reason !== 'invalid_output' && event.reason !== 'error')) return;
  // Metadata only — never the routine or the request text.
  const { captureError } = await import('@/lib/error-sink');
  captureError(new Error(`ai.${event.taskId} fallback: ${event.reason}`), {
    where: `ai.${event.taskId}`,
    attempts: event.attempts.map((a) => `${a.providerId}:${a.outcome}`).join(','),
  });
}

/** Ask the AI for an edit to `template`. Never throws; nothing is written here. */
export async function requestTemplateEdit(input: {
  template: WorkoutTemplate;
  intent: string;
  getToken: GetToken;
  userId: string | null | undefined;
  signal?: AbortSignal;
}): Promise<TemplateEditOutcome> {
  try {
    const { useSettings } = await import('@/store/settings-store');
    if (useSettings.getState().aiExplanationsEnabled !== true) return { status: 'unavailable', reason: 'disabled' };

    const [{ runAiTask }, { buildProviderChain }, { templateEditTask }, { isAiTaskEnabled }, byokMod, auth] =
      await Promise.all([
        import('./router'),
        import('./chain'),
        import('./tasks/template-edit'),
        import('./flags'),
        import('./byok'),
        import('@/sync/supabase-auth'),
      ]);
    let gateway: Parameters<typeof buildProviderChain>[0]['gateway'] = null;
    if (input.userId && auth.syncBackendReady()) {
      const env = await import('@/lib/env');
      gateway = { supabaseUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, getToken: supabaseToken(input.getToken) };
    }
    const providers = buildProviderChain({
      byok: byokMod.useAiSettings.getState().byok,
      getByokKey: byokMod.getByokKey,
      gateway,
    });
    if (providers.length === 0) return { status: 'unavailable', reason: 'unavailable' };

    const { listExerciseNamesForAi } = await import('@/db/queries/exercises');
    const taskInput = templateEditInput(input.template, input.intent, { catalog: await listExerciseNamesForAi() });
    const result = await runAiTask(templateEditTask, taskInput, {
      providers,
      enabled: await isAiTaskEnabled(templateEditTask.id),
      signal: input.signal,
      onEvent: (e) => void reportEvent(e).catch(() => undefined),
    });
    if (result.status !== 'ok') return { status: 'unavailable', reason: result.reason };
    const diff = result.output;
    if ('decline' in diff) return { status: 'declined', message: diff.decline };

    const draft = applyDiffToRows(taskInput, diff.ops);
    const names = draft.rows.filter((r) => r.status === 'added' || r.status === 'replaced').map((r) => r.name);
    const [{ resolveExerciseNames }, { newUuid }] = await Promise.all([
      import('@/db/queries/exercises'),
      import('@/lib/uuid'),
    ]);
    const resolved: Map<string, ResolvedExercise | null> = await resolveExerciseNames(names);
    return {
      status: 'proposal',
      proposal: buildTemplateProposal(input.template, taskInput, diff, resolved, newUuid()),
      context: { template: input.template, input: taskInput, diff, resolved },
    };
  } catch {
    return { status: 'unavailable', reason: 'error' };
  }
}
