import {
  COACH_NARRATE_PROMPT_VERSION,
  validateFeaturePack,
  type FeaturePackV1,
  type NarrateSurface,
} from '../_shared/contracts/narrate/feature-pack.ts';
import {
  sanitizeNarrationResponse,
  stubNarration,
  validateNarrationResponse,
} from '../_shared/contracts/narrate/narration.ts';
import { buildUserMessage, SYSTEM_PROMPT } from '../_shared/contracts/narrate/prompt.ts';
import { SYSTEM_PROMPT as TEMPLATE_EDIT_SYSTEM, buildUserMessage as templateEditUser } from '../_shared/contracts/templates/prompt.ts';
import {
  parseTemplateDiff,
  parseTemplateEditInput,
  TEMPLATE_EDIT_PROMPT_VERSION,
  type TemplateEditInput,
} from '../_shared/contracts/templates/template-edit.ts';
import { canonicalHash, hashJson } from './hash.ts';
import type { ChatMessage } from './upstream.ts';

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * A task the gateway can run. Everything model-facing comes from the shared
 * contracts (src/contracts → _shared/contracts), so the server runs exactly
 * the gates the app runs. Adding a task = one entry here + its contract.
 */
export interface ServerTask<I = unknown, O = unknown> {
  id: string;
  promptVersion: string;
  /** Calls per user per day through the shared Incline key. */
  dailyLimit: number;
  /** Whole-request model budget; keep it under the app task's `timeoutMs`. */
  budgetMs: number;
  parseInput(raw: unknown): Promise<Parsed<I>> | Parsed<I>;
  cacheKey(input: I): Promise<string>;
  messages(input: I): ChatMessage[];
  /** Sanitize + hard-validate model output (also re-checks cached rows). */
  parseOutput(raw: unknown, input: I): Parsed<O>;
  stub(input: I): O;
}

interface NarrateInput {
  pack: FeaturePackV1;
  surface: NarrateSurface;
}

const narrate: ServerTask<NarrateInput> = {
  id: 'narrate',
  promptVersion: COACH_NARRATE_PROMPT_VERSION,
  dailyLimit: 20,
  // App narrate timeout is 12 s; leave room for auth, cache and network.
  budgetMs: 9_000,
  async parseInput(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'input must be an object' };
    const rec = raw as Record<string, unknown>;
    const surface = rec.surface;
    if (surface !== 'post_session' && surface !== 'home') return { ok: false, error: 'invalid_surface' };
    const packed = validateFeaturePack(rec.pack);
    if (!packed.ok) return { ok: false, error: packed.error };
    if (packed.pack.surface !== surface) return { ok: false, error: 'surface_mismatch' };
    // The client hashes too; a mismatch means a different canonical form, so refuse.
    if (typeof rec.packHash !== 'string' || rec.packHash !== (await canonicalHash(packed.pack))) {
      return { ok: false, error: 'pack_hash_mismatch' };
    }
    return { ok: true, value: { pack: packed.pack, surface } };
  },
  cacheKey: async (input) => `${input.surface}.${await canonicalHash(input.pack)}`,
  messages: (input) => [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserMessage(input.pack) },
  ],
  parseOutput(raw, input) {
    const checked = validateNarrationResponse(sanitizeNarrationResponse(raw, input.pack), input.pack);
    return checked.ok ? { ok: true, value: checked.narration } : checked;
  },
  stub: (input) => stubNarration(input.pack),
};

const templateEdit: ServerTask<TemplateEditInput> = {
  id: 'template_edit',
  promptVersion: TEMPLATE_EDIT_PROMPT_VERSION,
  dailyLimit: 30,
  // App timeout is 20 s; a diff is a longer generation than narration.
  budgetMs: 15_000,
  parseInput: parseTemplateEditInput,
  cacheKey: (input) => hashJson(input),
  messages: (input) => [
    { role: 'system', content: TEMPLATE_EDIT_SYSTEM },
    { role: 'user', content: templateEditUser(input) },
  ],
  parseOutput: parseTemplateDiff,
  // Stub mode: a real, harmless edit so the whole apply/undo path can be exercised.
  stub: (input) =>
    input.rows.length
      ? { summary: 'Stub: one set less on the first exercise', ops: [{ op: 'setTargets', ref: 'e1', sets: Math.max(1, input.rows[0]!.sets - 1) }] }
      : { decline: 'Add an exercise first.' },
};

export const TASKS: Record<string, ServerTask> = {
  [narrate.id]: narrate as ServerTask,
  [templateEdit.id]: templateEdit as ServerTask,
};
