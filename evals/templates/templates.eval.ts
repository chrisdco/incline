import { describe, expect, it } from 'vitest';

// Same contract + resolver the app runs: prompt, gate, pure apply, catalog ranking.
import { buildUserMessage, SYSTEM_PROMPT, TEMPLATE_DIFF_JSON_SCHEMA } from '@/contracts/templates/prompt';
import {
  applyDiffToRows,
  estimateMinutes,
  parseTemplateDiff,
  type TemplateEditInput,
} from '@/contracts/templates/template-edit';
import { EXERCISES } from '@/db/seed';
import type { Exercise } from '@/db/types';
import { rankExercises } from '@/lib/exercise-search';
import { limitFixtures, parseJsonLoose, ProviderHttpError, providerFromEnv, type ChatMessage } from '../lib/provider';
import { summarize, writeReport, type CaseResult } from '../lib/report';
import { TEMPLATE_FIXTURES, type TemplateIntentFixture } from './fixtures';

/**
 * Scores TemplateDiffs structurally (many answers are valid). The catalog is
 * the bundled seed (~45 exercises), smaller than a real install with the
 * ExerciseDB import, so resolution here is a pessimistic floor.
 */
const MIN_PASS = Number(process.env.EVAL_MIN_PASS ?? '0.8');
const STRICT = process.env.EVAL_STRICT_SCHEMA === '1';
/** Unmatched names a case may have before it fails (the app lets the user pick these). */
const MAX_UNRESOLVED = 1;

const CATALOG = EXERCISES as unknown as Exercise[];
const MUSCLE_ALIASES: Record<string, string[]> = {
  quadriceps: ['quads'],
  lats: ['back'],
};

function toInput(fx: TemplateIntentFixture): TemplateEditInput {
  return {
    templateName: fx.base?.name ?? 'New routine',
    rows: (fx.base?.exercises ?? []).map((e, i) => {
      const [min, max] = e.reps.split('-').map(Number);
      return { ref: `e${i + 1}`, name: e.name, sets: e.sets, repsMin: min ?? null, repsMax: max ?? min ?? null };
    }),
    intent: fx.intent,
    ...(fx.memory ? { memory: fx.memory } : {}),
    catalog: CATALOG.map((e) => e.name),
  };
}

function resolve(name: string): Exercise | null {
  const top = rankExercises(CATALOG, name)[0];
  return top && (top.matchedOn === 'name' || top.matchedOn === 'alias') ? top.exercise : null;
}

/** null = pass; otherwise why it failed. */
export function scoreFixture(fx: TemplateIntentFixture, raw: unknown): { stage: string; detail: string } | null {
  const input = toInput(fx);
  const parsed = parseTemplateDiff(raw, input);
  if (!parsed.ok) return { stage: 'schema', detail: parsed.error };
  const diff = parsed.value;
  if (fx.expectDecline) return 'decline' in diff ? null : { stage: 'should_decline', detail: JSON.stringify(diff) };
  if ('decline' in diff) return { stage: 'declined', detail: diff.decline };

  const draft = applyDiffToRows(input, diff.ops);
  const fresh = draft.rows.filter((r) => r.status === 'added' || r.status === 'replaced');
  const unresolved = fresh.filter((r) => !resolve(r.name)).map((r) => r.name);
  if (unresolved.length > MAX_UNRESOLVED) return { stage: 'unresolved', detail: unresolved.join(', ') };

  const c = fx.constraints;
  const rows = draft.rows.filter((r) => !unresolved.includes(r.name));
  const names = draft.rows.map((r) => r.name.toLowerCase());
  const catalogRows = rows.map((r) => resolve(r.name)).filter((e): e is Exercise => e !== null);
  const totalSets = rows.reduce((n, r) => n + r.sets, 0);
  const minutes = estimateMinutes(rows);

  if (c.minExercises !== undefined && draft.rows.length < c.minExercises) {
    return { stage: 'too_few', detail: `${draft.rows.length} < ${c.minExercises}` };
  }
  if (c.maxExercises !== undefined && draft.rows.length > c.maxExercises) {
    return { stage: 'too_many', detail: `${draft.rows.length} > ${c.maxExercises}` };
  }
  if (c.maxTotalSets !== undefined && totalSets > c.maxTotalSets) {
    return { stage: 'sets', detail: `${totalSets} > ${c.maxTotalSets}` };
  }
  if (c.maxMinutes !== undefined && minutes > c.maxMinutes) {
    return { stage: 'minutes', detail: `${minutes} > ${c.maxMinutes}` };
  }
  const banned = (c.mustNotInclude ?? []).find((b) => names.some((n) => n.includes(b)));
  if (banned) return { stage: 'banned', detail: banned };
  if (c.equipmentOnly) {
    const off = catalogRows.find((e) => !c.equipmentOnly!.includes(e.equipment));
    if (off) return { stage: 'equipment', detail: `${off.name} (${off.equipment})` };
  }
  for (const muscle of c.mustCoverMuscles ?? []) {
    const wanted = [muscle, ...(MUSCLE_ALIASES[muscle] ?? [])];
    const covered = catalogRows.some((e) => wanted.includes(e.primaryMuscle) || e.secondaryMuscles.some((m) => wanted.includes(m)));
    if (!covered) return { stage: 'coverage', detail: muscle };
  }
  if (c.nameMatches && !new RegExp(c.nameMatches, 'i').test(draft.name)) {
    return { stage: 'name', detail: draft.name };
  }
  return null;
}

/** Offline stand-in: declines nothing-shaped requests, otherwise trims a set. */
function stubResponder(messages: ChatMessage[]): string {
  const user = messages[messages.length - 1]!.content;
  if (/banana|ignore|tore/i.test(user)) return JSON.stringify({ decline: 'Not something I can change.' });
  if (user.includes('(empty)')) {
    return JSON.stringify({
      summary: 'Stub routine',
      ops: [
        { op: 'add', exercise: 'Bench Press', sets: 3, repsMin: 8, repsMax: 10 },
        { op: 'add', exercise: 'Back Squat', sets: 3, repsMin: 5, repsMax: 8 },
      ],
    });
  }
  return JSON.stringify({ summary: 'Stub', ops: [{ op: 'setTargets', ref: 'e1', sets: 2 }] });
}

const provider = providerFromEnv(stubResponder);

describe.skipIf(!provider)('templates eval', () => {
  it(`passes ≥ ${MIN_PASS * 100}% of fixtures`, async () => {
    const results: CaseResult[] = [];
    for (const fx of limitFixtures(TEMPLATE_FIXTURES)) {
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(toInput(fx)) },
      ];
      let completion;
      try {
        completion = await provider!.complete(
          messages,
          STRICT
            ? { jsonSchema: { name: 'template_diff', schema: TEMPLATE_DIFF_JSON_SCHEMA as unknown as Record<string, unknown> }, temperature: 0.4 }
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
      const failed = scoreFixture(fx, raw);
      results.push(failed ? { ...base, ok: false, failure: failed.stage, detail: `${failed.detail} :: ${completion.text.slice(0, 300)}` } : { ...base, ok: true });
    }

    const summary = summarize('templates', provider!.id, results);
    writeReport(summary, results);
    // The stub only exercises the harness; it isn't meant to pass the constraints.
    if (provider!.id !== 'stub') expect(summary.passRate).toBeGreaterThanOrEqual(MIN_PASS);
  });
});
