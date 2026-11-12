import { buildUserMessage, SYSTEM_PROMPT, TEMPLATE_DIFF_JSON_SCHEMA } from '@/contracts/templates/prompt';
import {
  parseTemplateDiff,
  TEMPLATE_EDIT_PROMPT_VERSION,
  type TemplateDiff,
  type TemplateEditInput,
} from '@/contracts/templates/template-edit';

import type { AiTask } from '../types';

/**
 * "Change this routine by asking" (AI-ARCHITECTURE §2.1). Same prompt and
 * gate as the edge task. No cache: asking again should be allowed to give
 * a different answer, and the routine changes after every apply anyway.
 */
export const templateEditTask: AiTask<TemplateEditInput, TemplateDiff> = {
  id: 'template_edit',
  promptVersion: TEMPLATE_EDIT_PROMPT_VERSION,
  tier: 'medium',
  dataCategories: ['routines', 'exercises', 'memory', 'message'],
  needs: { structuredOutput: true },
  timeoutMs: 20_000,
  buildMessages(input) {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(input) },
    ];
  },
  outputSchema: TEMPLATE_DIFF_JSON_SCHEMA as unknown as Record<string, unknown>,
  gateway: {
    fn: 'ai-task',
    body(input) {
      return { task: 'template_edit', promptVersion: TEMPLATE_EDIT_PROMPT_VERSION, input };
    },
    pick(json) {
      if (!json || typeof json !== 'object') return null;
      const body = json as { ok?: unknown; output?: unknown };
      return body.ok === true ? (body.output ?? null) : null;
    },
  },
  parse(raw, input) {
    const checked = parseTemplateDiff(raw, input);
    return checked.ok ? { ok: true, output: checked.value } : checked;
  },
  fallback() {
    return null;
  },
};
