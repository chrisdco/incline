import { asRepQuality, effectiveRpe } from "../../../src/contracts/coaching/rep-quality";
/**
 * Plateau review on the web (PROGRESSION.md). Same contract as the app and
 * MCP (src/contracts), so all three name the same stalled lifts and fixes.
 * The web never edits a routine: "Send to app" queues a proposal that the
 * app shows in its plateau inbox, where the user applies it (built-in
 * routines live only on the phone).
 */

import {
  isProgressionAutonomy,
  parseRemedyPlan,
  type PlateauFinding,
  type ProgressionAutonomy,
  type ProgressionDecision,
} from "../../../src/contracts/coaching/progression";
import { normalizeRefKey, progressionFindings, type NormSet } from "../../../src/contracts/mcp/shape";
import type { Unit } from "../../../src/contracts/mcp/tools";
import { supabaseForUser } from "./supabase";
import { resolveExercises } from "./queries";

const LOG_SCAN = 150;
const SET_SCAN = 5000;
const DECISION_SCAN = 200;

export interface WebProgression {
  findings: PlateauFinding[];
  /** Proposals waiting in the app (from Ask, Claude or here). */
  inbox: (ProgressionDecision & { exerciseName: string })[];
  /** Latest decisions, newest first (history). */
  decisions: (ProgressionDecision & { exerciseName: string })[];
  unit: Unit;
  autonomy: ProgressionAutonomy;
}

type Experience = "beginner" | "intermediate" | "advanced";

interface DecisionRow {
  id: string;
  exercise_ref: string;
  exercise_name: string;
  remedy: string;
  params: unknown;
  status: string;
  source: string;
  rationale: string;
  rule_version: string;
  resume_after_sessions: number | null;
  created_at: string;
  resolved_at: string | null;
}

export async function loadProgressionInputs() {
  const { supabase, userId } = await supabaseForUser();
  const [{ data: profile }, { data: logs }, { data: decisionRows }, { data: prefs }] = await Promise.all([
    supabase.from("profiles").select("unit, experience_level").eq("user_id", userId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("workout_logs")
      .select("id, started_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(LOG_SCAN),
    supabase
      .from("progression_decisions")
      .select("id, exercise_ref, exercise_name, remedy, params, status, source, rationale, rule_version, resume_after_sessions, created_at, resolved_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(DECISION_SCAN),
    supabase.from("user_preferences").select("payload").eq("user_id", userId).maybeSingle(),
  ]);
  const started = new Map(((logs ?? []) as { id: string; started_at: string }[]).map((l) => [l.id, l.started_at]));
  type SetRow = {
    workout_log_id: string;
    ref_type: string;
    catalog_external_id: string | null;
    user_exercise_id: string | null;
    weight: number;
    reps: number;
    rpe: number | null;
    rep_quality: string | null;
    set_type: string | null;
  };
  let sets: SetRow[] = [];
  if (started.size) {
    const { data } = await supabase
      .from("set_entries")
      .select("workout_log_id, ref_type, catalog_external_id, user_exercise_id, weight, reps, rpe, rep_quality, set_type")
      .eq("user_id", userId)
      .eq("completed", true)
      .is("deleted_at", null)
      .in("workout_log_id", [...started.keys()])
      .limit(SET_SCAN);
    sets = (data ?? []) as SetRow[];
  }
  const names = await resolveExercises(sets);
  const norm: NormSet[] = [];
  for (const s of sets) {
    const key = s.ref_type === "custom" ? `custom:${s.user_exercise_id}` : `catalog:${s.catalog_external_id}`;
    const meta = names.get(key);
    norm.push({
      logId: s.workout_log_id,
      startedAt: started.get(s.workout_log_id) ?? new Date(0).toISOString(),
      exerciseKey: key,
      exercise: meta?.name ?? "Unknown exercise",
      weightKg: s.weight,
      reps: s.reps,
      primaryMuscle: meta?.muscle ?? null,
      secondaryMuscles: [],
      rpe: effectiveRpe(s.rpe, asRepQuality(s.rep_quality)),
      setType: s.set_type ?? null,
    });
  }
  const decisions = ((decisionRows ?? []) as DecisionRow[]).map((r) => ({
    id: r.id,
    exerciseKey: normalizeRefKey(r.exercise_ref),
    exerciseName: r.exercise_name,
    remedy: r.remedy as ProgressionDecision["remedy"],
    params: parseRemedyPlan(r.params),
    status: r.status as ProgressionDecision["status"],
    source: r.source as ProgressionDecision["source"],
    rationale: r.rationale,
    ruleVersion: r.rule_version,
    resumeAfterSessions: r.resume_after_sessions,
    createdAt: Date.parse(r.created_at),
    resolvedAt: r.resolved_at ? Date.parse(r.resolved_at) : null,
  }));
  const p = profile as { unit?: string; experience_level?: string } | null;
  const unit: Unit = p?.unit === "imperial" ? "imperial" : "metric";
  const e = p?.experience_level;
  const experience: Experience = e === "beginner" || e === "advanced" ? e : "intermediate";
  const rawAutonomy = (prefs as { payload?: Record<string, unknown> } | null)?.payload?.progressionAutonomy;
  const autonomy: ProgressionAutonomy = isProgressionAutonomy(rawAutonomy) ? rawAutonomy : "ask";
  return { supabase, userId, norm, decisions, unit, experience, autonomy };
}

export async function getProgression(): Promise<WebProgression> {
  const { norm, decisions, unit, experience, autonomy } = await loadProgressionInputs();
  const findings = progressionFindings(norm, { unit, experience, decisions, now: Date.now() });
  const latest = new Map<string, (typeof decisions)[number]>();
  for (const d of decisions) if (!latest.has(d.exerciseKey)) latest.set(d.exerciseKey, d);
  const inbox = [...latest.values()].filter((d) => d.status === "proposed");
  return { findings, inbox, decisions, unit, autonomy };
}

