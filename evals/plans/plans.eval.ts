import { describe, expect, it } from 'vitest';

// Same contract + proposal builder the app runs.
import { buildPlanProposal, resolvePlanNames, type ResolvedPlanExercise } from '@/ai/plan-build-client';
import { assemblePlan, parsePlanBuildInput, parsePlanDraft, stubPlanDraft, type PlanBuildInput } from '@/contracts/plans/plan-build';
import { buildUserMessage, PLAN_DRAFT_JSON_SCHEMA, SYSTEM_PROMPT } from '@/contracts/plans/prompt';
import { EXERCISES } from '@/db/seed';
import type { Exercise } from '@/db/types';
import { rankExercises } from '@/lib/exercise-search';
import { limitFixtures, parseJsonLoose, ProviderHttpError, providerFromEnv, type ChatMessage } from '../lib/provider';
import { summarize, writeReport, type CaseResult } from '../lib/report';
import { PLAN_FIXTURES, type PlanFixture } from './fixtures';

/**
 * Scores plan drafts structurally. The catalog is the bundled seed (~45
 * exercises), smaller than a real install, so resolution is a pessimistic floor.
 */
const MIN_PASS = Number(process.env.EVAL_MIN_PASS ?? '0.8');
const STRICT = process.env.EVAL_STRICT_SCHEMA === '1';
/** Share of rows that may fail to resolve before a case fails. */
const MAX_UNRESOLVED_SHARE = 0.2;
/** Volume warnings a case may keep (the seed's muscle tags are coarse). */
const MAX_WARNINGS = 2;

const CATALOG = EXERCISES as unknown as Exercise[];

function toInput(fx: PlanFixture): PlanBuildInput {
  const parsed = parsePlanBuildInput({ ...fx.input, catalog: CATALOG.map((e) => e.name) });
  if (!parsed.ok) throw new Error(`fixture ${fx.id}: ${parsed.error}`);
  return parsed.value;
}

function resolve(name: string): Exercise | null {
  const top = rankExercises(CATALOG, name)[0];
  return top && (top.matchedOn === 'name' || top.matchedOn === 'alias') ? top.exercise : null;
}

/** null = pass; otherwise why it failed. */
export async function scoreFixture(fx: PlanFixture, raw: unknown): Promise<{ stage: string; detail: string } | null> {
  const input = toInput(fx);
  const parsed = parsePlanDraft(raw, input);
  if (!parsed.ok) return { stage: 'schema', detail: parsed.error };
  const draft = parsed.value;
  if (fx.expectDecline) return 'decline' in draft ? null : { stage: 'should_decline', detail: draft.name };
  if ('decline' in draft) return { stage: 'declined', detail: draft.decline };

  const names = assemblePlan(input, draft).days.flatMap((d) => d.rows.map((r) => r.exercise));
  const resolved = await resolvePlanNames(names, input.equipment, async (ns) => new Map<string, ResolvedPlanExercise | null>(ns.map((n) => [n, resolve(n)])));
  const proposal = buildPlanProposal(input, draft, resolved, 'eval');
  if (!proposal.payload) return { stage: 'empty_day', detail: proposal.unresolved.join(', ') };
  const unresolvedRows = names.filter((n) => !resolved.get(n)).length;
  if (unresolvedRows / names.length > MAX_UNRESOLVED_SHARE) {
    return { stage: 'unresolved', detail: proposal.unresolved.join(', ') };
  }
  if (proposal.warnings.length > MAX_WARNINGS) return { stage: 'volume', detail: proposal.warnings.join('; ') };

  const c = fx.constraints ?? {};
  const rows = proposal.days.flatMap((d) => d.rows);
  const byId = new Map(CATALOG.map((e) => [e.id, e]));
  const lower = names.map((n) => n.toLowerCase());
  const banned = (c.mustNotInclude ?? []).find((b) => lower.some((n) => n.includes(b)));
  if (banned) return { stage: 'banned', detail: banned };
  if (c.equipmentOnly) {
    const off = rows.map((r) => byId.get(r.exerciseId)).find((e) => e && !c.equipmentOnly!.includes(e.equipment));
    if (off) return { stage: 'equipment', detail: `${off.name} (${off.equipment})` };
  }
  if (c.nameMatches && !new RegExp(c.nameMatches, 'i').test(proposal.name)) return { stage: 'name', detail: proposal.name };
  for (const muscle of c.extrasCover ?? []) {
    const hit = rows.some((r) => r.role === 'extra' && (r.muscles?.primary === muscle || r.muscles?.secondary.includes(muscle)));
    if (!hit) return { stage: 'focus', detail: `no extra for ${muscle}` };
  }
  return null;
}

/** Offline stand-in: declines obvious non-requests, otherwise the contract's stub draft. */
let current: PlanFixture | null = null;
function stubResponder(messages: ChatMessage[]): string {
  const user = messages[messages.length - 1]!.content;
  if (/surgery|poem|ignore/i.test(user)) return JSON.stringify({ decline: 'Not something I can plan.' });
  return JSON.stringify(stubPlanDraft(toInput(current!)));
}

const provider = providerFromEnv(stubResponder);

describe.skipIf(!provider)('plans eval', () => {
  it(`passes ≥ ${MIN_PASS * 100}% of fixtures`, async () => {
    const results: CaseResult[] = [];
    for (const fx of limitFixtures(PLAN_FIXTURES)) {
      current = fx;
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(toInput(fx)) },
      ];
      let completion;
      try {
        completion = await provider!.complete(
          messages,
          STRICT
            ? { jsonSchema: { name: 'plan_draft', schema: PLAN_DRAFT_JSON_SCHEMA as unknown as Record<string, unknown> }, temperature: 0.4 }
            : { json: true, temperature: 0.4 },
        );
      } catch (err) {
        const failure = err instanceof ProviderHttpError && err.status === 429 ? 'rate_limited' : 'http';
        results.push({ id: fx.id, ok: false, failure, detail: String(err), latencyMs: 0, promptTokens: null, completionTokens: null });
        continue;
      }
      const base = {
        id: fx.id,
        latencyMs: completion.latencyMs,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        retries: completion.retries,
      };
      const raw = parseJsonLoose(completion.text);
      if (raw === undefined) {
        results.push({ ...base, ok: false, failure: 'json', detail: completion.text.slice(0, 300) });
        continue;
      }
      const failed = await scoreFixture(fx, raw);
      results.push(failed ? { ...base, ok: false, failure: failed.stage, detail: `${failed.detail} :: ${completion.text.slice(0, 300)}` } : { ...base, ok: true });
    }

    const summary = summarize('plans', provider!.id, results);
    writeReport(summary, results);
    if (provider!.id !== 'stub') expect(summary.passRate).toBeGreaterThanOrEqual(MIN_PASS);
  });
});
