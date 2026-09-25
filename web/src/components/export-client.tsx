"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";

import { Card, SectionTitle } from "@/components/ui";

type ExportFormat = "json" | "csv";

export default function ExportClient() {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState<{ workouts: number; sets: number } | null>(null);

  async function run(format: ExportFormat) {
    setBusy(true);
    setError(null);
    setExported(null);
    try {
      const token = await getToken({ template: "supabase" });
      if (!token) throw new Error("Sign-in expired — reload and sign in again.");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      );
      const { data: logs, error: logError } = await supabase
        .from("workout_logs")
        .select("id,name,started_at,ended_at,duration_seconds,total_volume,unit,notes")
        .is("deleted_at", null)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(1000);
      if (logError) throw new Error(logError.message);
      const rows = logs ?? [];
      const ids = rows.map((l: { id: string }) => l.id);
      let sets: Record<string, unknown>[] = [];
      if (ids.length > 0) {
        const { data, error: setError } = await supabase
          .from("set_entries")
          .select("workout_log_id,ref_type,catalog_external_id,user_exercise_id,set_index,weight,reps,completed,set_type,rpe")
          .in("workout_log_id", ids)
          .is("deleted_at", null)
          .limit(10000);
        if (setError) throw new Error(setError.message);
        sets = (data ?? []) as Record<string, unknown>[];
      }
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "json") {
        download(`incline-export-${stamp}.json`, JSON.stringify({ workouts: rows, sets }, null, 2), "application/json");
      } else {
        const lines = ["workout_id,workout_name,date,exercise_ref,weight,reps,completed,set_type"];
        for (const s of sets) {
          const log = rows.find((l: { id: string; name: string; started_at: string }) => l.id === s.workout_log_id) as { id: string; name: string; started_at: string } | undefined;
          const ref = s.ref_type === "catalog" ? s.catalog_external_id : s.user_exercise_id;
          lines.push(
            [String(log?.id ?? ""), log?.name ?? "", log?.started_at.slice(0, 10) ?? "", String(ref ?? ""), String(s.weight ?? ""), String(s.reps ?? ""), String(s.completed ?? ""), String(s.set_type ?? "")].map(csvCell).join(","),
          );
        }
        download(`incline-export-${stamp}.csv`, lines.join("\n"), "text/csv");
      }
      setExported({ workouts: rows.length, sets: sets.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle>Download your data</SectionTitle>
      <p className="mb-4 text-sm text-zinc-500">Up to 1,000 workouts with sets. Same scope as the mobile export.</p>
      {error ? <p role="alert" className="mb-3 text-sm text-red-600">{error}</p> : null}
      {exported ? (
        <p aria-live="polite" className="mb-3 text-sm text-emerald-700 dark:text-emerald-300">
          Exported {exported.workouts} workouts with {exported.sets} sets.
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          onClick={() => void run("json")}
          disabled={busy}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {busy ? "Working…" : "Export JSON"}
        </button>
        <button
          onClick={() => void run("csv")}
          disabled={busy}
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          {busy ? "Working…" : "Export CSV"}
        </button>
      </div>
    </Card>
  );
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function download(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
