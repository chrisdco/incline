import { CHAT_PROPOSE_TOOLS, MAX_PROPOSAL_CHANGE } from '@/contracts/ai/chat-tools';
import type { ChatPart, Json, ProposalPart } from '@/contracts/ai/chat';
import { openDatabase } from '@/db/client';
import { newUuid } from '@/lib/uuid';

import type { DeviceTool } from './read-tools';

/**
 * Device propose tools (AI-CHAT Phase 2). They never write: each checks its
 * target on SQLite and returns a proposal the app shows as a card. Applying
 * goes through the routine's own Ask flow (validated diff, action registry,
 * undo), so the model can only ever suggest.
 */

/** The action a routine-change card hands to the routine screen. */
export const ROUTINE_CHANGE_ACTION = 'template.edit_intent';

export interface RoutineChangePayload {
  templateId: number;
  routineName: string;
  change: string;
}

type Db = Awaited<ReturnType<typeof openDatabase>>;

function clean(text: unknown, max: number): string | null {
  if (typeof text !== 'string') return null;
  const t = text.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/** Stored or streamed payload → a valid routine change, or null. */
export function parseRoutineChange(raw: Json | undefined): RoutineChangePayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, Json>;
  const change = clean(p.change, MAX_PROPOSAL_CHANGE);
  const routineName = clean(p.routineName, 80);
  const id = p.templateId;
  if (!change || !routineName || typeof id !== 'number' || !Number.isInteger(id) || id < 1) return null;
  return { templateId: id, routineName, change };
}

async function proposeRoutineChange(db: Db, args: Record<string, Json>): Promise<Json> {
  const id = typeof args.routine_id === 'string' && /^\d{1,12}$/.test(args.routine_id) ? Number(args.routine_id) : NaN;
  if (!Number.isFinite(id)) throw new Error('routine_id is required (an id from list_routines)');
  const change = clean(args.change, MAX_PROPOSAL_CHANGE);
  if (!change) throw new Error('change is required');
  const row = await db.getFirstAsync<{ id: number; name: string }>(
    'SELECT id, name FROM workout_templates WHERE id = ? AND deleted_at IS NULL AND is_custom = 1',
    id,
  );
  if (!row) throw new Error('routine not found; only their own routines (list_routines) can be changed');
  return {
    status: 'proposed',
    proposal_id: newUuid(),
    routine: row.name,
    routine_id: String(row.id),
    change,
    note: 'Shown to the user as a card. Nothing has changed; they review the exact edit and apply it themselves.',
  };
}

function routineChangePart(result: Json): ChatPart | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const r = result as Record<string, Json>;
  const payload = parseRoutineChange({ templateId: Number(r.routine_id), routineName: r.routine ?? null, change: r.change ?? null });
  if (!payload || typeof r.proposal_id !== 'string') return null;
  const part: ProposalPart = {
    type: 'proposal',
    action: ROUTINE_CHANGE_ACTION,
    proposalId: r.proposal_id,
    summary: payload.change,
    payload: { ...payload },
    status: 'pending',
  };
  return part;
}

const HANDLERS: Record<string, { run: (db: Db, args: Record<string, Json>) => Promise<Json>; toPart: (result: Json) => ChatPart | null }> = {
  propose_routine_change: { run: proposeRoutineChange, toPart: routineChangePart },
};

export function deviceProposeTools(open: () => Promise<Db> = openDatabase): DeviceTool[] {
  return CHAT_PROPOSE_TOOLS.filter((spec) => HANDLERS[spec.name]).map((spec) => {
    const h = HANDLERS[spec.name]!;
    return {
      spec,
      async run(args) {
        const a = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, Json>) : {};
        return h.run(await open(), a);
      },
      toPart: h.toPart,
    };
  });
}
