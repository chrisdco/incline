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

export function chatToolsFor(surface: ChatSurface, tools: readonly ToolSpec[] = CHAT_READ_TOOLS): ToolSpec[] {
  return tools.filter((t) => t.surfaces.includes(surface));
}

export function findTool(name: string, tools: readonly ToolSpec[] = CHAT_READ_TOOLS): ToolSpec | undefined {
  return tools.find((t) => t.name === name);
}
