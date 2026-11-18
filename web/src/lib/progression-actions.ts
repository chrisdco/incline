"use server";

import { revalidatePath } from "next/cache";

import {
  DECLINE_RESUME_SESSIONS,
  PROGRESSION_RULE_VERSION,
  isProgressionAutonomy,
  type Remedy,
} from "../../../src/contracts/coaching/progression";
import { liftHistories, progressionFindings } from "../../../src/contracts/mcp/shape";
import { loadProgressionInputs } from "./progression";
import { supabaseForUser } from "./supabase";

/**
 * "Send to app" / "Not now" from the web. The plan is recomputed on the
 * server from the same contract (never trusted from the form), so the web can
 * only queue a fix Incline itself would offer.
 */
async function decide(formData: FormData, status: "proposed" | "declined"): Promise<void> {
  const key = String(formData.get("exerciseKey") ?? "");
  const remedy = String(formData.get("remedy") ?? "") as Remedy;
  const { supabase, userId, norm, decisions, unit, experience } = await loadProgressionInputs();
  const findings = progressionFindings(norm, { unit, experience, decisions, now: Date.now() });
  const finding = findings.find((f) => f.exerciseKey === key);
  if (!finding) return;
  const option = [finding.fix, ...finding.alternatives].find((o) => o.plan.remedy === remedy) ?? finding.fix;
  // Deload is a whole-program change made in the app's deload screen.
  if (status === "proposed" && option.plan.remedy === "deload") return;
  const now = new Date().toISOString();
  const lift = liftHistories(norm).find((l) => l.key === key);
  const { error } = await supabase.from("progression_decisions").insert({
    id: crypto.randomUUID(),
    user_id: userId,
    exercise_ref: key,
    exercise_name: (lift?.name ?? finding.name).slice(0, 120),
    remedy: option.plan.remedy,
    params: option.plan,
    status,
    source: "web",
    rationale: status === "proposed" ? "Sent from Incline web." : "",
    rule_version: PROGRESSION_RULE_VERSION,
    resume_after_sessions: status === "declined" ? DECLINE_RESUME_SESSIONS : null,
    resolved_at: status === "declined" ? now : null,
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error("Could not save; try again.");
  revalidatePath("/progress");
}

export async function sendFixToAppAction(formData: FormData): Promise<void> {
  await decide(formData, "proposed");
}

export async function declineFixAction(formData: FormData): Promise<void> {
  await decide(formData, "declined");
}

/** Withdraw a proposal still waiting in the app (any source). */
export async function withdrawProposalAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const { supabase, userId } = await supabaseForUser();
  const now = new Date().toISOString();
  await supabase
    .from("progression_decisions")
    .update({ status: "declined", resolved_at: now, updated_at: now, resume_after_sessions: DECLINE_RESUME_SESSIONS })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "proposed");
  revalidatePath("/progress");
}

/** Settings → Plateau fixes. Merges into the synced account prefs payload. */
export async function setAutonomyAction(formData: FormData): Promise<void> {
  const mode = formData.get("autonomy");
  if (!isProgressionAutonomy(mode)) return;
  const { supabase, userId } = await supabaseForUser();
  const { data } = await supabase.from("user_preferences").select("payload").eq("user_id", userId).maybeSingle();
  const payload = { ...((data as { payload?: Record<string, unknown> } | null)?.payload ?? {}), progressionAutonomy: mode };
  await supabase
    .from("user_preferences")
    .upsert({ user_id: userId, payload, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  revalidatePath("/settings");
  revalidatePath("/progress");
}
