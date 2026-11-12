import {
  applyPlanEdit,
  groupWeeks,
  MAX_PLAN_ROUTINES,
  samePlan,
  WEEKDAYS,
  weekRange,
  type PlanEdit,
  type PlanEditInput,
  type PlanSlot,
} from '@/contracts/plans/plan-edit';
import type { PlanEditPayload, PlanRoutineRow } from '@/db/queries/programs';
import type { Program } from '@/db/types';
import type { GetToken } from '@/sync/supabase-auth';

import type { AiEvent, AiFailure } from './types';

export interface ScheduleLine {
  label: string;
  days: string;
  /** Not in the plan before the edit. */
  changed: boolean;
}

export interface PlanEditProposal {
  proposalId: string;
  summary: string;
  name: string;
  renamed: boolean;
  weeksBefore: number;
  weeksAfter: number;
  /** Shown only when the schedule changes. */
  schedule: ScheduleLine[] | null;
  swaps: { from: string; to: string; routines: string[] }[];
  /** AI exercise names with no catalog match; those swaps are left out. */
  unresolved: string[];
  /** null when nothing applicable is left. */
  payload: PlanEditPayload | null;
}

/** The plan as the model sees it, plus the ref → routine id map to write it back. */
export interface PlanEditContext {
  program: Program;
  input: PlanEditInput;
  templateIds: Map<string, number>;
  rows: PlanRoutineRow[];
}

export type PlanEditOutcome =
  | { status: 'proposal'; proposal: PlanEditProposal }
  | { status: 'declined'; message: string }
  | { status: 'unavailable'; reason: AiFailure };

export interface ResolvedName {
  id: number;
  name: string;
}

/** AI plans name routines "Plan: Day A"; the plan's own name adds nothing on its screen. */
export function routineLabel(planName: string, routine: string): string {
  const prefix = `${planName}: `;
  return routine.startsWith(prefix) && routine.length > prefix.length ? routine.slice(prefix.length) : routine;
}

/** Routines r1…rN in the order they first appear in the schedule. */
export function planEditContext(program: Program, rows: PlanRoutineRow[], intent: string, catalog?: string[]): PlanEditContext {
  const workouts = [...(program.workouts ?? [])].sort((a, b) => a.week - b.week || a.day - b.day || a.sortOrder - b.sortOrder);
  const templateIds = new Map<string, number>();
  const refOf = new Map<number, string>();
  const routines: PlanEditInput['routines'] = [];
  for (const w of workouts) {
    if (refOf.has(w.templateId)) continue;
    const ref = `r${routines.length + 1}`;
    refOf.set(w.templateId, ref);
    templateIds.set(ref, w.templateId);
    routines.push({
      ref,
      name: routineLabel(program.name, w.templateName ?? 'Workout').slice(0, 120),
      exercises: rows.filter((r) => r.templateId === w.templateId).slice(0, 20).map((r) => r.name),
    });
  }
  const schedule: PlanSlot[] = workouts.flatMap((w) => {
    const routine = refOf.get(w.templateId);
    return routine && w.week <= program.weeks ? [{ week: w.week, day: w.day, routine }] : [];
  });
  return {
    program,
    templateIds,
    rows,
    input: {
      planName: program.name.slice(0, 60),
      weeks: Math.max(1, Math.min(16, program.weeks)),
      routines,
      schedule,
      intent,
      ...(catalog?.length ? { catalog } : {}),
    },
  };
}

function scheduleLines(ctx: PlanEditContext, slots: PlanSlot[], weeks: number): { label: string; days: string }[] {
  const names = new Map(ctx.input.routines.map((r) => [r.ref, r.name]));
  return groupWeeks(slots, weeks).map((g) => ({
    label: weekRange(g),
    days: g.slots.map((s) => `${WEEKDAYS[s.day - 1]} ${names.get(s.routine) ?? 'Workout'}`).join(' · ') || 'Rest',
  }));
}

/** Pure: the edit, resolved, as a preview plus the write payload. */
export function buildPlanEditProposal(
  ctx: PlanEditContext,
  edit: Exclude<PlanEdit, { decline: string }>,
  resolved: Map<string, ResolvedName | null>,
  proposalId: string,
): PlanEditProposal {
  const { input } = ctx;
  const draft = applyPlanEdit(input, edit.ops);
  const names = new Map(input.routines.map((r) => [r.ref, r.name]));

  const unresolved: string[] = [];
  const swaps: PlanEditProposal['swaps'] = [];
  const payloadSwaps: PlanEditPayload['swaps'] = [];
  for (const s of draft.swaps) {
    const hit = resolved.get(s.to) ?? null;
    if (!hit) {
      unresolved.push(s.to);
      continue;
    }
    const routines: string[] = [];
    for (const ref of s.routines) {
      const templateId = ctx.templateIds.get(ref);
      const rows = ctx.rows.filter((r) => r.templateId === templateId);
      const from = rows.find((r) => r.name === s.from);
      // Same exercise, or already in that routine: nothing to swap there.
      if (!templateId || !from || from.exerciseId === hit.id || rows.some((r) => r.exerciseId === hit.id)) continue;
      payloadSwaps.push({ templateId, fromExerciseId: from.exerciseId, toExerciseId: hit.id });
      routines.push(names.get(ref) ?? 'Workout');
    }
    if (routines.length) swaps.push({ from: s.from, to: hit.name, routines });
  }

  const effective = { ...draft, swaps: payloadSwaps.length ? draft.swaps : [] };
  const scheduleChanged =
    draft.weeks !== input.weeks || JSON.stringify(applyPlanEdit(input, []).schedule) !== JSON.stringify(draft.schedule);
  const before = new Set(scheduleLines(ctx, input.schedule, input.weeks).map((l) => `${l.label}|${l.days}`));
  const schedule = scheduleChanged
    ? scheduleLines(ctx, draft.schedule, draft.weeks).map((l) => ({ ...l, changed: !before.has(`${l.label}|${l.days}`) }))
    : null;

  const slots = draft.schedule.flatMap((s) => {
    const templateId = ctx.templateIds.get(s.routine);
    return templateId ? [{ week: s.week, day: s.day, templateId }] : [];
  });
  return {
    proposalId,
    summary: edit.summary,
    name: draft.name,
    renamed: draft.name !== input.planName,
    weeksBefore: input.weeks,
    weeksAfter: draft.weeks,
    schedule,
    swaps,
    unresolved,
    payload:
      samePlan(input, effective) || slots.length === 0
        ? null
        : { programId: ctx.program.id, name: draft.name, weeks: draft.weeks, slots, swaps: payloadSwaps, summary: edit.summary },
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
  // Metadata only — never the plan or the request text.
  const { captureError } = await import('@/lib/error-sink');
  captureError(new Error(`ai.${event.taskId} fallback: ${event.reason}`), {
    where: `ai.${event.taskId}`,
    attempts: event.attempts.map((a) => `${a.providerId}:${a.outcome}`).join(','),
  });
}

/** Ask the AI for a change to `program` (custom plans only). Never throws; nothing is written here. */
export async function requestPlanEdit(input: {
  program: Program;
  intent: string;
  getToken: GetToken;
  userId: string | null | undefined;
  signal?: AbortSignal;
}): Promise<PlanEditOutcome> {
  try {
    const { useSettings } = await import('@/store/settings-store');
    if (useSettings.getState().aiExplanationsEnabled !== true) return { status: 'unavailable', reason: 'disabled' };

    const [{ runAiTask }, { buildProviderChain }, { planEditTask }, { isAiTaskEnabled }, byokMod, auth] =
      await Promise.all([
        import('./router'),
        import('./chain'),
        import('./tasks/plan-edit'),
        import('./flags'),
        import('./byok'),
        import('@/sync/supabase-auth'),
      ]);
    let gateway: Parameters<typeof buildProviderChain>[0]['gateway'] = null;
    if (input.userId && auth.syncBackendReady()) {
      const env = await import('@/lib/env');
      gateway = { supabaseUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, getToken: supabaseToken(input.getToken) };
    }
    const { readAiConsent } = await import('./consent');
    const chainInputs = {
      byok: byokMod.useAiSettings.getState().byok,
      getByokKey: byokMod.getByokKey,
      gateway,
      consent: readAiConsent(),
    };
    const providers = buildProviderChain(chainInputs);
    if (providers.length === 0) {
      const { chainBlockedByConsent } = await import('./chain');
      return { status: 'unavailable', reason: chainBlockedByConsent(chainInputs) ? 'consent' : 'unavailable' };
    }

    const [{ listExerciseNamesForAi, resolveExerciseNames }, { getPlanRoutineRows }] = await Promise.all([
      import('@/db/queries/exercises'),
      import('@/db/queries/programs'),
    ]);
    const templateIds = (input.program.workouts ?? []).map((w) => w.templateId);
    const [rows, catalog] = await Promise.all([getPlanRoutineRows(templateIds), listExerciseNamesForAi()]);
    const ctx = planEditContext(input.program, rows, input.intent, catalog);
    if (ctx.input.routines.length === 0) return { status: 'declined', message: 'Add a workout to this plan first.' };
    // The model sees every routine or none: a slot it can't name would be dropped on save.
    if (ctx.input.routines.length > MAX_PLAN_ROUTINES) {
      return { status: 'declined', message: `Asking works on plans with up to ${MAX_PLAN_ROUTINES} different workouts.` };
    }

    const result = await runAiTask(planEditTask, ctx.input, {
      providers,
      enabled: await isAiTaskEnabled(planEditTask.id),
      signal: input.signal,
      onEvent: (e) => void reportEvent(e).catch(() => undefined),
    });
    if (result.status !== 'ok') return { status: 'unavailable', reason: result.reason };
    const edit = result.output;
    if ('decline' in edit) return { status: 'declined', message: edit.decline };

    const draft = applyPlanEdit(ctx.input, edit.ops);
    const [resolved, { newUuid }] = await Promise.all([
      resolveExerciseNames(draft.swaps.map((s) => s.to)),
      import('@/lib/uuid'),
    ]);
    return { status: 'proposal', proposal: buildPlanEditProposal(ctx, edit, resolved, newUuid()) };
  } catch {
    return { status: 'unavailable', reason: 'error' };
  }
}
