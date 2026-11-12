import { PLAN_EDIT_JSON_SCHEMA, PLAN_EDIT_SYSTEM, buildPlanEditMessage } from '@/contracts/plans/edit-prompt';
import { parsePlanEdit, PLAN_EDIT_PROMPT_VERSION, type PlanEdit, type PlanEditInput } from '@/contracts/plans/plan-edit';

import type { AiTask } from '../types';

/**
 * "Change this plan by asking". Same prompt and gate as the edge task. No
 * cache: the plan changes after every apply, and asking again may differ.
 */
export const planEditTask: AiTask<PlanEditInput, PlanEdit> = {
  id: 'plan_edit',
  promptVersion: PLAN_EDIT_PROMPT_VERSION,
  tier: 'medium',
  dataCategories: ['routines', 'exercises', 'memory', 'message'],
  needs: { structuredOutput: true },
  timeoutMs: 20_000,
  buildMessages(input) {
    return [
      { role: 'system', content: PLAN_EDIT_SYSTEM },
      { role: 'user', content: buildPlanEditMessage(input) },
    ];
  },
  outputSchema: PLAN_EDIT_JSON_SCHEMA as unknown as Record<string, unknown>,
  gateway: {
    fn: 'ai-task',
    body(input) {
      return { task: 'plan_edit', promptVersion: PLAN_EDIT_PROMPT_VERSION, input };
    },
    pick(json) {
      if (!json || typeof json !== 'object') return null;
      const body = json as { ok?: unknown; output?: unknown };
      return body.ok === true ? (body.output ?? null) : null;
    },
  },
  parse(raw, input) {
    const checked = parsePlanEdit(raw, input);
    return checked.ok ? { ok: true, output: checked.value } : checked;
  },
  fallback() {
    return null;
  },
};
