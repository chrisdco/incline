import { DELOAD_APPLIED_KEY } from '@/coaching/deload';
import {
  latestDecisions,
  parseRemedyPlan,
  type DecisionSource,
  type DecisionStatus,
  type LiftHistory,
  type PlateauFinding,
  type ProgressionAutonomy,
  type ProgressionDecision,
  type Remedy,
  type RemedyPlan,
} from '@/contracts/coaching/progression';
import { liftHistories, normalizeRefKey, progressionFindings, type NormSet } from '@/contracts/mcp/shape';
import type { Unit } from '@/contracts/mcp/tools';
import type { PlanExperience } from '@/contracts/plans/rules';
import { openDatabase } from '@/db/client';
import type { Tx } from '@/db/write';
import { exerciseRefKeyFromRow } from '@/sync/exercise-ref';

/**
 * Plateau review on device, reads only (PROGRESSION.md). Same contract as MCP
 * and web: NormSets keyed by the synced exercise ref key, so a decision made
 * in Claude or on the web lines up with the lift here. Three batched reads
 * (logs, sets + exercise refs, secondary muscles); never a query per lift.
 * Writes live in ./progression.ts.
 */

type Db = Awaited<ReturnType<typeof openDatabase>>;

const LOG_SCAN = 150;
const SET_SCAN = 6000;
const ph = (n: number) => Array.from({ length: n }, () => '?').join(',');

export interface ProgressionSets {
  sets: NormSet[];
  /** Ref key → local exercise id (for routines, overrides, navigation). */
  idByKey: Map<string, number>;
}

/** Finished workouts' completed sets, newest first, keyed by ref key. */
export async function loadProgressionSets(db?: Db): Promise<ProgressionSets> {
  const conn = db ?? (await openDatabase());
  const logs = await conn.getAllAsync<{ id: number; started_at: number }>(
    `SELECT id, started_at FROM workout_logs WHERE deleted_at IS NULL AND ended_at IS NOT NULL
     ORDER BY started_at DESC LIMIT ${LOG_SCAN}`,
  );
  const idByKey = new Map<string, number>();
  if (!logs.length) return { sets: [], idByKey };
  const started = new Map(logs.map((l) => [l.id, l.started_at]));
  const rows = await conn.getAllAsync<{
    workout_log_id: number;
    exercise_id: number;
    weight: number;
    reps: number;
    rpe: number | null;
    set_type: string | null;
    name: string;
    primary_muscle: string | null;
    is_custom: number;
    uuid: string | null;
    external_id: string | null;
  }>(
    `SELECT s.workout_log_id, s.exercise_id, s.weight, s.reps, s.rpe, s.set_type,
            e.name, e.primary_muscle, e.is_custom, e.uuid, e.external_id
     FROM set_entries s JOIN exercises e ON e.id = s.exercise_id
     WHERE s.completed = 1 AND s.deleted_at IS NULL AND s.workout_log_id IN (${ph(logs.length)})
     ORDER BY s.created_at DESC LIMIT ${SET_SCAN}`,
    ...logs.map((l) => l.id),
  );
  const ids = [...new Set(rows.map((r) => r.exercise_id))];
  const secondary = new Map<number, string[]>();
  if (ids.length) {
    const sec = await conn.getAllAsync<{ exercise_id: number; muscle: string }>(
      `SELECT exercise_id, muscle FROM exercise_secondary_muscles WHERE exercise_id IN (${ph(ids.length)})`,
      ...ids,
    );
    for (const r of sec) secondary.set(r.exercise_id, [...(secondary.get(r.exercise_id) ?? []), r.muscle]);
  }
  const sets: NormSet[] = [];
  for (const r of rows) {
    const key = exerciseRefKeyFromRow(r.exercise_id, r);
    if (!key) continue;
    const norm = normalizeRefKey(key);
    idByKey.set(norm, r.exercise_id);
    sets.push({
      logId: String(r.workout_log_id),
      startedAt: new Date(started.get(r.workout_log_id)!).toISOString(),
      exerciseKey: norm,
      exercise: r.name,
      weightKg: r.weight,
      reps: r.reps,
      primaryMuscle: r.primary_muscle,
      secondaryMuscles: secondary.get(r.exercise_id) ?? [],
      rpe: r.rpe,
      setType: r.set_type,
    });
  }
  return { sets, idByKey };
}

// ---------- decisions ----------

interface DecisionRow {
  uuid: string;
  exercise_ref: string;
  exercise_name: string;
  remedy: string;
  params: string | null;
  status: string;
  source: string;
  rationale: string;
  rule_version: string;
  resume_after_sessions: number | null;
  created_at: number;
  resolved_at: number | null;
  updated_at: number;
}

const STATUSES: readonly DecisionStatus[] = ['proposed', 'applied', 'declined', 'done', 'reverted'];

export interface StoredDecision extends ProgressionDecision {
  exerciseName: string;
}

function toDecision(r: DecisionRow): StoredDecision | null {
  if (!(STATUSES as readonly string[]).includes(r.status)) return null;
  let params: RemedyPlan | null = null;
  if (r.params) {
    try {
      params = parseRemedyPlan(JSON.parse(r.params));
    } catch {
      params = null;
    }
  }
  return {
    id: r.uuid,
    exerciseKey: normalizeRefKey(r.exercise_ref),
    exerciseName: r.exercise_name,
    remedy: r.remedy as Remedy | 'keep_going',
    params,
    status: r.status as DecisionStatus,
    source: r.source as DecisionSource,
    rationale: r.rationale,
    ruleVersion: r.rule_version,
    resumeAfterSessions: r.resume_after_sessions,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  };
}

/** Every live decision, newest first (bounded: one row per fix ever made). */
export async function listProgressionDecisions(db?: Db | Tx): Promise<StoredDecision[]> {
  const conn = db ?? (await openDatabase());
  const rows = await conn.getAllAsync<DecisionRow>(
    `SELECT uuid, exercise_ref, exercise_name, remedy, params, status, source, rationale, rule_version,
            resume_after_sessions, created_at, resolved_at, updated_at
     FROM progression_decisions WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 500`,
  );
  return rows.flatMap((r) => toDecision(r) ?? []);
}

export async function getProgressionDecision(uuid: string): Promise<StoredDecision | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<DecisionRow>(
    `SELECT uuid, exercise_ref, exercise_name, remedy, params, status, source, rationale, rule_version,
            resume_after_sessions, created_at, resolved_at, updated_at
     FROM progression_decisions WHERE uuid = ? AND deleted_at IS NULL`,
    uuid,
  );
  return row ? toDecision(row) : null;
}

// ---------- review ----------

export interface ProgressionReview {
  findings: PlateauFinding[];
  /** Pending proposals from Claude, the web, Ask or the coach. */
  inbox: StoredDecision[];
  decisions: StoredDecision[];
  /** Recent top sets per lift (current load for assessing a proposal). */
  lifts: LiftHistory[];
  idByKey: Map<string, number>;
  unit: Unit;
}

async function profileOf(db: Db): Promise<{ unit: Unit; experience: PlanExperience }> {
  const row = await db.getFirstAsync<{ unit: string; experience_level: string | null }>(
    'SELECT unit, experience_level FROM user_profile WHERE deleted_at IS NULL ORDER BY id LIMIT 1',
  );
  const e = row?.experience_level;
  return {
    unit: row?.unit === 'imperial' ? 'imperial' : 'metric',
    experience: e === 'beginner' || e === 'advanced' ? e : 'intermediate',
  };
}

export interface ProgressionInputsOnDevice {
  sets: NormSet[];
  idByKey: Map<string, number>;
  decisions: StoredDecision[];
  unit: Unit;
  experience: PlanExperience;
  lastDeloadAt: number | null;
}

/** Everything the shared contract needs, read in parallel (Ask's tools use it too). */
export async function loadProgressionInputs(db?: Db): Promise<ProgressionInputsOnDevice> {
  const conn = db ?? (await openDatabase());
  const [{ sets, idByKey }, decisions, prof, deload] = await Promise.all([
    loadProgressionSets(conn),
    listProgressionDecisions(conn),
    profileOf(conn),
    conn.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', DELOAD_APPLIED_KEY),
  ]);
  return { sets, idByKey, decisions, ...prof, lastDeloadAt: deload ? Number(deload.value) || null : null };
}

/** Findings + inbox for Progress, Home and the fix screen. `off` still lists stalled lifts, with no fixes queued. */
export async function getProgressionReview(now = Date.now()): Promise<ProgressionReview> {
  const inp = await loadProgressionInputs();
  const findings = progressionFindings(inp.sets, {
    unit: inp.unit,
    experience: inp.experience,
    decisions: inp.decisions,
    now,
    lastDeloadAt: inp.lastDeloadAt,
  });
  const latest = latestDecisions(inp.decisions);
  const inbox = inp.decisions.filter((d) => d.status === 'proposed' && latest.get(d.exerciseKey)?.id === d.id);
  return { findings, inbox, decisions: inp.decisions, lifts: liftHistories(inp.sets), idByKey: inp.idByKey, unit: inp.unit };
}

/** Whether a finding should prompt the user at all under the autonomy setting. */
export function promptsFor(review: ProgressionReview, autonomy: ProgressionAutonomy): PlateauFinding[] {
  return autonomy === 'off' ? [] : review.findings.filter((f) => f.status === 'open');
}

// ---------- applying ----------

/** Resolve a ref key to a local exercise id (no writes). */
export async function exerciseIdForKey(key: string, db?: Db | Tx): Promise<number | null> {
  const conn = db ?? (await openDatabase());
  const k = normalizeRefKey(key);
  if (k.startsWith('custom:')) {
    const r = await conn.getFirstAsync<{ id: number }>('SELECT id FROM exercises WHERE uuid = ? AND deleted_at IS NULL', k.slice(7));
    return r?.id ?? null;
  }
  if (k.startsWith('catalog:seed:')) {
    const id = Number(k.slice('catalog:seed:'.length));
    if (!Number.isInteger(id)) return null;
    const r = await conn.getFirstAsync<{ id: number }>('SELECT id FROM exercises WHERE id = ? AND deleted_at IS NULL', id);
    return r?.id ?? null;
  }
  if (k.startsWith('catalog:')) {
    const r = await conn.getFirstAsync<{ id: number }>(
      'SELECT id FROM exercises WHERE external_id = ? AND deleted_at IS NULL',
      k.slice(8),
    );
    return r?.id ?? null;
  }
  return null;
}

export interface RoutineUse {
  templateId: number;
  name: string;
  isCustom: boolean;
  /** This lift's rows in the routine (usually one). */
  rows: { id: number; sets: number; repsMin: number; repsMax: number }[];
}

/** Routines that program this lift: one query. Built-ins change on this device only (they don't sync). */
export async function routinesWithExercise(exerciseId: number, db?: Db | Tx): Promise<RoutineUse[]> {
  const conn = db ?? (await openDatabase());
  const rows = await conn.getAllAsync<{
    template_id: number;
    name: string;
    is_custom: number;
    id: number;
    target_sets: number;
    target_reps_min: number;
    target_reps_max: number;
  }>(
    `SELECT te.template_id, t.name, t.is_custom, te.id, te.target_sets, te.target_reps_min, te.target_reps_max
     FROM template_exercises te JOIN workout_templates t ON t.id = te.template_id
     WHERE te.exercise_id = ? AND te.deleted_at IS NULL AND t.deleted_at IS NULL
     ORDER BY t.is_custom DESC, t.name`,
    exerciseId,
  );
  const out = new Map<number, RoutineUse>();
  for (const r of rows) {
    const use = out.get(r.template_id) ?? { templateId: r.template_id, name: r.name, isCustom: !!r.is_custom, rows: [] };
    use.rows.push({ id: r.id, sets: r.target_sets, repsMin: r.target_reps_min, repsMax: r.target_reps_max });
    out.set(r.template_id, use);
  }
  return [...out.values()];
}

/**
 * Applied plateau resets still waiting for their session: local exercise id →
 * the reset load (kg). A reset covers the next session only; once the lift
 * is trained after the decision, it no longer applies. Two queries.
 */
export async function getResetOverrides(exerciseIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const ids = [...new Set(exerciseIds.filter((id) => id > 0))];
  if (!ids.length) return out;
  const db = await openDatabase();
  const decisions = (await listProgressionDecisions(db)).filter((d) => d.remedy === 'reset');
  if (!decisions.length) return out;
  const latest = latestDecisions(decisions);
  const exRows = await db.getAllAsync<{
    id: number;
    is_custom: number;
    uuid: string | null;
    external_id: string | null;
    last_at: number | null;
  }>(
    `SELECT e.id, e.is_custom, e.uuid, e.external_id,
       (SELECT MAX(w.started_at) FROM set_entries s JOIN workout_logs w ON w.id = s.workout_log_id
        WHERE s.exercise_id = e.id AND s.completed = 1 AND s.deleted_at IS NULL
          AND w.deleted_at IS NULL AND w.ended_at IS NOT NULL) AS last_at
     FROM exercises e WHERE e.id IN (${ph(ids.length)})`,
    ...ids,
  );
  for (const e of exRows) {
    const key = exerciseRefKeyFromRow(e.id, e);
    const d = key ? latest.get(normalizeRefKey(key)) : undefined;
    if (!d || d.status !== 'applied' || d.params?.remedy !== 'reset') continue;
    if (e.last_at != null && e.last_at > d.createdAt) continue;
    out.set(e.id, d.params.weightKg);
  }
  return out;
}
