import {
  COACH_NARRATE_PROMPT_VERSION,
  hashFeaturePack,
  type FeaturePackV1,
  type NarrateSurface,
} from '@/coaching/feature-pack';
import {
  sanitizeNarrationResponse,
  validateNarrationResponse,
  type CoachNarration,
} from '@/coaching/narrate-validate';

import { buildUserMessage, NARRATION_JSON_SCHEMA, SYSTEM_PROMPT } from '../../../supabase/functions/coach-narrate/prompt';
import type { AiTask } from '../types';

/**
 * Coach narration as a registry task: same prompt as the edge function (one
 * source, evals/narrate scores it), same client gate (no number the rules
 * didn't produce). Fallback is null — the surface keeps its rule copy.
 */
export interface NarrateInput {
  surface: NarrateSurface;
  pack: FeaturePackV1;
  /** Cache scope so an account switch never reads another user's wording. */
  userId: string;
}

function packFor(input: NarrateInput): FeaturePackV1 {
  return { ...input.pack, surface: input.surface };
}

export const narrateTask: AiTask<NarrateInput, CoachNarration> = {
  id: 'narrate',
  promptVersion: COACH_NARRATE_PROMPT_VERSION,
  tier: 'small',
  needs: { structuredOutput: true },
  timeoutMs: 12_000,
  buildMessages(input) {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(packFor(input)) },
    ];
  },
  outputSchema: NARRATION_JSON_SCHEMA as unknown as Record<string, unknown>,
  gateway: {
    fn: 'coach-narrate',
    async body(input) {
      const pack = packFor(input);
      return {
        pack,
        packHash: await hashFeaturePack(pack),
        promptVersion: COACH_NARRATE_PROMPT_VERSION,
        surface: input.surface,
      };
    },
    pick(json) {
      if (!json || typeof json !== 'object') return null;
      const body = json as { ok?: unknown; narration?: unknown };
      return body.ok === true ? (body.narration ?? null) : null;
    },
  },
  parse(raw, input) {
    const pack = packFor(input);
    const checked = validateNarrationResponse(sanitizeNarrationResponse(raw, pack), pack);
    return checked.ok ? { ok: true, output: checked.narration } : checked;
  },
  fallback() {
    return null;
  },
  async cacheKey(input) {
    return `${input.userId}.${input.surface}.${await hashFeaturePack(packFor(input))}`;
  },
  // One cached narration per user + surface: a new pack replaces the old one.
  cacheSlot(input) {
    return `${input.userId}.${input.surface}`;
  },
};
