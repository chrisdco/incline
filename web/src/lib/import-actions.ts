"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";

import { supabaseForUser } from "./supabase";
import { convertWeight, normalizeExerciseName } from "./csv-import";

/** Small catalog projection for client-side name matching. */
export async function getCatalogNameMapAction(): Promise<{ name: string; external_id: string; target_muscle: string }[]> {
  const { supabase } = await supabaseForUser();
  const { data, error } = await supabase.from("exercises").select("name,external_id,target_muscle").limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as { name: string; external_id: string; target_muscle: string }[];
}

const importSetSchema = z.object({
  weight: z.number().finite().min(0).max(5000),
  reps: z.number().int().min(0).max(1000),
  rpe: z.number().int().min(1).max(10).nullable(),
  setType: z.enum(["working", "warmup"]),
});

const importExerciseSchema = z.object({
  ref: z.union([
    z.object({ kind: z.literal("catalog"), external_id: z.string().min(1) }),
    z.object({ kind: z.literal("custom"), name: z.string().min(1).max(120) }),
  ]),
  fallbackName: z.string().max(120),
  notes: z.string().max(2000),
  sets: z.array(importSetSchema).min(1).max(100),
});

const importWorkoutSchema = z.object({
  title: z.string().max(160),
  startIso: z.string().datetime(),
  endIso: z.string().datetime(),
  notes: z.string().max(5000),
  fileUnit: z.enum(["kg", "lb"]),
  exercises: z.array(importExerciseSchema).min(1).max(60),
});

const importBatchSchema = z.object({
  targetUnit: z.enum(["kg", "lb"]),
  workouts: z.array(importWorkoutSchema).min(1).max(40),
});

export interface ImportBatchResult {
  importedWorkouts: number;
  importedSets: number;
  skippedExisting: number;
  createdExercises: number;
  failed: { title: string; error: string }[];
}

/**
 * Insert one batch of parsed workouts as finished logs. Idempotent per
 * (started_at, name): re-running an import skips what is already there.
 * Weights convert to the user's unit; mobile pulls these rows on next sync.
 */
export async function importBatchAction(input: unknown): Promise<ImportBatchResult> {
  const batch = importBatchSchema.parse(input);
  const { supabase, userId } = await supabaseForUser();
  const now = new Date().toISOString();
  const toUnit = batch.targetUnit === "kg" ? "metric" : "imperial";

  let importedWorkouts = 0;
  let importedSets = 0;
  let skippedExisting = 0;
  let createdExercises = 0;
  const failed: { title: string; error: string }[] = [];

  // Ensure custom exercises once per batch (dedupe by normalized name).
  const customNames = new Map<string, string>();
  for (const w of batch.workouts) {
    for (const ex of w.exercises) {
      if (ex.ref.kind === "custom") {
        const key = normalizeExerciseName(ex.ref.name);
        if (!customNames.has(key)) customNames.set(key, ex.ref.name.trim());
      }
    }
  }
  const customIdByKey = new Map<string, string>();
  if (customNames.size > 0) {
    const names = [...customNames.values()];
    const { data: existing } = await supabase
      .from("user_exercises")
      .select("id,name")
      .eq("user_id", userId)
      .in("name", names);
    for (const row of (existing ?? []) as { id: string; name: string }[]) {
      customIdByKey.set(normalizeExerciseName(row.name), row.id);
    }
    const missing = names.filter((n) => !customIdByKey.has(normalizeExerciseName(n)));
    // Independent inserts — one round trip, not one per exercise.
    const created = await Promise.all(
      missing.map(async (name) => {
        const id = randomUUID();
        const { error } = await supabase.from("user_exercises").insert({
          id,
          user_id: userId,
          name,
          primary_muscle: "full_body",
          movement_pattern: "isolation",
          equipment: "other",
          category: "strength",
          is_compound: false,
          tips: "",
        });
        if (error) throw new Error(`Could not create exercise "${name}": ${error.message}`);
        return { name, id };
      }),
    );
    for (const { name, id } of created) {
      customIdByKey.set(normalizeExerciseName(name), id);
      createdExercises += 1;
    }
  }

  for (const w of batch.workouts) {
    // Idempotency: exact (started_at, ended_at, name) match skips re-imports.
    // ended_at is in the key so two same-day same-name sessions don't collide.
    const { data: dup } = await supabase
      .from("workout_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("started_at", w.startIso)
      .eq("ended_at", w.endIso)
      .eq("name", w.title)
      .is("deleted_at", null)
      .limit(1);
    if (dup && dup.length > 0) {
      skippedExisting += 1;
      continue;
    }

    const logId = randomUUID();
    const setRows: Record<string, unknown>[] = [];
    let volume = 0;
    for (const ex of w.exercises) {
      const ref =
        ex.ref.kind === "catalog"
          ? { ref_type: "catalog", catalog_external_id: ex.ref.external_id, user_exercise_id: null }
          : {
              ref_type: "custom",
              catalog_external_id: null,
              user_exercise_id: customIdByKey.get(normalizeExerciseName(ex.ref.name)) ?? null,
            };
      if (ex.ref.kind === "custom" && !ref.user_exercise_id) continue;
      ex.sets.forEach((s, i) => {
        const weight = convertWeight(s.weight, w.fileUnit, batch.targetUnit);
        if (s.setType === "working") volume += weight * s.reps;
        setRows.push({
          id: randomUUID(),
          user_id: userId,
          workout_log_id: logId,
          ...ref,
          set_index: i,
          weight,
          reps: s.reps,
          completed: true,
          rest_seconds: null,
          superset_group: null,
          set_type: s.setType,
          rpe: s.rpe,
          created_at: now,
          updated_at: now,
        });
      });
    }
    if (setRows.length === 0) continue;
    // Per-workout isolation: one bad workout fails alone with its name
    // attached; the batch continues. Re-running skips what landed.
    try {
      const duration = Math.max(0, Math.floor((new Date(w.endIso).getTime() - new Date(w.startIso).getTime()) / 1000));
      const { error: logError } = await supabase.from("workout_logs").insert({
        id: logId,
        user_id: userId,
        template_id: null,
        name: w.title,
        started_at: w.startIso,
        ended_at: w.endIso,
        duration_seconds: duration,
        total_volume: Math.round(volume * 100) / 100,
        unit: toUnit,
        notes: w.notes,
        created_at: now,
        updated_at: now,
      });
      if (logError) throw new Error(logError.message);
      // Chunked so no single request carries the whole history.
      for (let i = 0; i < setRows.length; i += 500) {
        const { error: setError } = await supabase.from("set_entries").insert(setRows.slice(i, i + 500));
        if (setError) throw new Error(setError.message);
      }
      importedWorkouts += 1;
      importedSets += setRows.length;
    } catch (e) {
      failed.push({ title: w.title, error: e instanceof Error ? e.message : "unknown error" });
    }
  }

  return { importedWorkouts, importedSets, skippedExisting, createdExercises, failed };
}
