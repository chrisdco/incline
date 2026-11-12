import { parsePlanDraft, PLAN_BUILD_PROMPT_VERSION, type PlanBuildInput, type PlanDraft } from '@/contracts/plans/plan-build';
import { buildUserMessage, PLAN_DRAFT_JSON_SCHEMA, SYSTEM_PROMPT } from '@/contracts/plans/prompt';

import type { AiTask } from '../types';

/**
 * "Build me a plan" (PROGRAMMING.md §6). Same prompt and gate as the edge
 * task; the model only fills slots the code laid out.
 */
export const planBuildTask: AiTask<PlanBuildInput, PlanDraft> = {
  id: 'plan_build',
  promptVersion: PLAN_BUILD_PROMPT_VERSION,
  tier: 'medium',
  dataCategories: ['profile', 'exercises', 'memory', 'message'],
  needs: { structuredOutput: true },
  timeoutMs: 35_000,
  buildMessages(input) {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(input) },
    ];
  },
  outputSchema: PLAN_DRAFT_JSON_SCHEMA as unknown as Record<string, unknown>,
  gateway: {
    fn: 'ai-task',
    body(input) {
      return { task: 'plan_build', promptVersion: PLAN_BUILD_PROMPT_VERSION, input };
    },
    pick(json) {
      if (!json || typeof json !== 'object') return null;
      const body = json as { ok?: unknown; output?: unknown };
      return body.ok === true ? (body.output ?? null) : null;
    },
  },
  parse(raw, input) {
    const checked = parsePlanDraft(raw, input);
    return checked.ok ? { ok: true, output: checked.value } : checked;
  },
  fallback() {
    return null;
  },
};
