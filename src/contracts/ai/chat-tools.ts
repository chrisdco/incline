/**
 * The chat tool registry contract (AI-CHAT §3.4, §3A.3): one definition per
 * tool, shared by Ask, the in-session sheet, builders and incline-mcp. The
 * read tools are the MCP tools verbatim (same names and schemas) so an answer
 * in Claude and an answer in Ask come from the same capability.
 */
import type { AiDataCategory } from './data-use';
import type { ChatSurface, ToolSpec } from './chat';
import { TOOLS, type ToolDef } from '../mcp/tools';

const ALL_SURFACES: readonly ChatSurface[] = ['chat', 'session', 'builder', 'mcp'];

/** What each MCP read tool returns, for "AI data use" (G9). */
const CATEGORIES: Record<string, readonly AiDataCategory[]> = {
  get_profile: ['profile'],
  list_routines: ['routines'],
  get_routine: ['routines', 'exercises'],
  list_workouts: ['workouts'],
  get_workout: ['workouts', 'exercises'],
  get_exercise_history: ['workouts', 'records', 'exercises'],
  get_personal_records: ['records', 'exercises'],
  get_training_summary: ['summaries'],
  search_exercises: ['exercises'],
};

function fromMcp(def: ToolDef): ToolSpec {
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    inputSchema: def.inputSchema,
    kind: def.annotations.readOnlyHint ? 'read' : 'propose',
    surfaces: ALL_SURFACES,
    dataCategories: CATEGORIES[def.name] ?? [],
    version: 1,
  };
}

/**
 * Read tools available to in-app chat. `create_routine` is MCP-only: in the
 * app, writes are proposals the user applies (propose_* tools, Phase 2).
 */
export const CHAT_READ_TOOLS: readonly ToolSpec[] = TOOLS.filter((t) => t.annotations.readOnlyHint).map(fromMcp);

/** Max length of a proposed change, in characters: one or two sentences. */
export const MAX_PROPOSAL_CHANGE = 300;

/**
 * Propose tools (AI-CHAT Phase 2): they never write. The device checks the
 * target and returns a proposal; the app shows it as a card the user reviews
 * and applies through the action registry (validated diff, undo).
 */
export const CHAT_PROPOSE_TOOLS: readonly ToolSpec[] = [
  {
    name: 'propose_routine_change',
    title: 'Suggest a routine change',
    description:
      "Suggest a change to one of the user's own routines (from list_routines). Nothing changes: the user sees a card, reviews the exact edit and applies it. Read the routine first. Describe the change in plain words, e.g. \"Add a back-off set of bench at 80% after the top set\".",
    inputSchema: {
      type: 'object',
      properties: {
        routine_id: { type: 'string', description: 'id from list_routines' },
        change: { type: 'string', description: `What to change, one or two sentences (max ${MAX_PROPOSAL_CHANGE} characters)` },
      },
      required: ['routine_id', 'change'],
      additionalProperties: false,
    },
    kind: 'propose',
    surfaces: ['chat'],
    dataCategories: ['routines'],
    version: 1,
  },
];

/** Everything in-app chat may call: reads, then proposals. */
export const CHAT_TOOLS: readonly ToolSpec[] = [...CHAT_READ_TOOLS, ...CHAT_PROPOSE_TOOLS];

export function chatToolsFor(surface: ChatSurface, tools: readonly ToolSpec[] = CHAT_READ_TOOLS): ToolSpec[] {
  return tools.filter((t) => t.surfaces.includes(surface));
}

export function findTool(name: string, tools: readonly ToolSpec[] = CHAT_TOOLS): ToolSpec | undefined {
  return tools.find((t) => t.name === name);
}
