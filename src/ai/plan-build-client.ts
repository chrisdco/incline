import {
  assemblePlan,
  balanceVolume,
  deloadDay,
  planDescription,
  type PlanBuildInput,
  type PlanDay,
  type PlanDraft,
  type PlanRow,
} from '@/contracts/plans/plan-build';
import type { WeekPlan } from '@/contracts/plans/rules';
import { estimateMinutes } from '@/contracts/templates/template-edit';
import type { PlanInsertInput } from '@/db/queries/programs';
import type { Exercise } from '@/db/types';
import type { GetToken } from '@/sync/supabase-auth';

import type { AiEvent, AiFailure } from './types';

export interface ProposalPlanRow extends PlanRow {
  exerciseId: number;
}

export interface ProposalPlanDay {
  key: string;
  name: string;
  rows: ProposalPlanRow[];
  minutes: number;
}

export interface PlanProposal {
  proposalId: string;
  name: string;
  summary: string;
  description: string;
  input: PlanBuildInput;
  days: ProposalPlanDay[];
  /** Training days of a normal week, Monday first. */
  week: { weekday: number; key: string }[];
  weeks: WeekPlan[];
  /** Weekly sets per major muscle after balancing (fractional; secondaries count half). */
  weekly: Record<string, number>;
  warnings: string[];
  /** Rows the volume check removed, and extras that did not fit the session. */
  trimmed: string[];
  /** AI names with no catalog match; left out of the plan. */
  unresolved: string[];
  /** null when nothing usable is left. */
  payload: PlanInsertInput | null;
}

export type PlanBuildOutcome =
  | { status: 'proposal'; proposal: PlanProposal }
  | { status: 'declined'; message: string }
  | { status: 'unavailable'; reason: AiFailure };

export type ResolvedPlanExercise = Pick<Exercise, 'id' | 'name' | 'primaryMuscle' | 'secondaryMuscles'>;

const MAX_TEMPLATE_NAME = 60;

function noteFor(row: PlanRow): string {
  if (row.role === 'main' || row.role === 'secondary') {
    return `Hit ${row.repsMax} reps on every set, then add weight next time.`;
  }
  return `Work up to ${row.repsMax} reps, then go heavier.`;
}

function routineName(plan: string, day: string): string {
  return `${plan}: ${day}`.slice(0, MAX_TEMPLATE_NAME);
}

/**
 * Pure: the model's draft, resolved and volume-checked, as a preview plus the
 * write payload. Names with no catalog match are dropped (and listed); a name
 * that resolves to an exercise already in that workout is dropped as a repeat.
 */
export function buildPlanProposal(
  input: PlanBuildInput,
  draft: Exclude<PlanDraft, { decline: string }>,
  resolved: Map<string, ResolvedPlanExercise | null>,
  proposalId: string,
): PlanProposal {
  const assembled = assemblePlan(input, draft);
  const unresolved: string[] = [];
  const ids = new Map<string, number>();
  const days: PlanDay[] = assembled.days.map((d) => {
    const used = new Set<number>();
    const rows = d.rows.flatMap((r): PlanRow[] => {
      const hit = resolved.get(r.exercise) ?? null;
      if (!hit) {
        if (!unresolved.includes(r.exercise)) unresolved.push(r.exercise);
        return [];
      }
      if (used.has(hit.id)) return [];
      used.add(hit.id);
      ids.set(hit.name, hit.id);
      return [{ ...r, exercise: hit.name, muscles: { primary: hit.primaryMuscle, secondary: hit.secondaryMuscles } }];
    });
    return { ...d, rows };
  });

  const balanced = balanceVolume({ days, skeleton: assembled.skeleton }, input.experience);
  const withIds = (day: PlanDay): ProposalPlanDay => {
    const rows = day.rows.map((r) => ({ ...r, exerciseId: ids.get(r.exercise)! }));
    return { key: day.key, name: day.name, rows, minutes: estimateMinutes(rows) };
  };
  const build = balanced.days.map(withIds);
  const description = planDescription(input, assembled.skeleton, assembled.summary);
  const hasDeload = assembled.skeleton.weeks.some((w) => w.kind === 'deload');
  const deload = hasDeload ? balanced.days.map((d) => withIds(deloadDay(d))) : [];
  const usable = build.every((d) => d.rows.length > 0);

  const templates = [...build, ...deload].map((d) => ({
    name: routineName(assembled.name, d.name),
    estimatedMinutes: d.minutes,
    rows: d.rows.map((r) => ({
      exerciseId: r.exerciseId,
      sets: r.sets,
      repsMin: r.repsMin,
      repsMax: r.repsMax,
      restSeconds: r.restSeconds,
      notes: noteFor(r),
    })),
  }));
  const index = new Map(build.map((d, i) => [d.key, i]));
  const schedule = assembled.skeleton.weeks.flatMap((w) =>
    assembled.skeleton.week.map((slot) => ({
      week: w.week,
      day: slot.weekday,
      template: index.get(slot.key)! + (w.kind === 'deload' ? build.length : 0),
    })),
  );

  return {
    proposalId,
    name: assembled.name,
    summary: assembled.summary,
    description,
    input,
    days: build,
    week: assembled.skeleton.week,
    weeks: assembled.skeleton.weeks,
    weekly: balanced.weekly,
    warnings: balanced.warnings,
    trimmed: [...balanced.removed, ...assembled.droppedExtras],
    unresolved,
    payload: usable
      ? { name: assembled.name, description, weeks: input.weeks, difficulty: input.experience, templates, schedule }
      : null,
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
  // Metadata only — never the request text.
  const { captureError } = await import('@/lib/error-sink');
  captureError(new Error(`ai.${event.taskId} fallback: ${event.reason}`), {
    where: `ai.${event.taskId}`,
    attempts: event.attempts.map((a) => `${a.providerId}:${a.outcome}`).join(','),
  });
}

/** Ask the AI for a plan. Never throws; nothing is written here. */
export async function requestPlanBuild(input: {
  plan: Omit<PlanBuildInput, 'catalog'>;
  getToken: GetToken;
  userId: string | null | undefined;
  signal?: AbortSignal;
}): Promise<PlanBuildOutcome> {
  try {
    const { useSettings } = await import('@/store/settings-store');
    if (useSettings.getState().aiExplanationsEnabled !== true) return { status: 'unavailable', reason: 'disabled' };

    const [{ runAiTask }, { buildProviderChain }, { planBuildTask }, { isAiTaskEnabled }, byokMod, auth] =
      await Promise.all([
        import('./router'),
        import('./chain'),
        import('./tasks/plan-build'),
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

    const { listExerciseNamesForAi, resolveExerciseNames } = await import('@/db/queries/exercises');
    const taskInput: PlanBuildInput = { ...input.plan, catalog: await listExerciseNamesForAi(150) };
    const result = await runAiTask(planBuildTask, taskInput, {
      providers,
      enabled: await isAiTaskEnabled(planBuildTask.id),
      signal: input.signal,
      onEvent: (e) => void reportEvent(e).catch(() => undefined),
    });
    if (result.status !== 'ok') return { status: 'unavailable', reason: result.reason };
    const draft = result.output;
    if ('decline' in draft) return { status: 'declined', message: draft.decline };

    const names = assemblePlan(taskInput, draft).days.flatMap((d) => d.rows.map((r) => r.exercise));
    const [resolved, { newUuid }] = await Promise.all([resolveExerciseNames(names), import('@/lib/uuid')]);
    return { status: 'proposal', proposal: buildPlanProposal(taskInput, draft, resolved, newUuid()) };
  } catch {
    return { status: 'unavailable', reason: 'error' };
  }
}
