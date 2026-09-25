"use client";

import { useMemo, useState } from "react";

import { Card, EmptyState, SectionTitle } from "@/components/ui";
import {
  detectSource,
  normalizeExerciseName,
  parseHevy,
  parseStrong,
  type ImportWorkout,
  type ParseResult,
} from "@/lib/csv-import";
import { getCatalogNameMapAction, importBatchAction } from "@/lib/import-actions";

type CatalogEntry = { name: string; external_id: string; target_muscle: string };

interface PreviewExercise {
  name: string;
  matched: boolean;
  sets: number;
}

export default function ImportClient({ defaultUnit }: { defaultUnit: "kg" | "lb" }) {
  const [source, setSource] = useState<"auto" | "hevy" | "strong">("auto");
  const [strongUnit, setStrongUnit] = useState<"kg" | "lb">(defaultUnit);
  const [targetUnit, setTargetUnit] = useState<"kg" | "lb">(defaultUnit);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ workouts: number; sets: number; skipped: number; created: number; failed: { title: string; error: string }[] } | null>(null);

  const catalogByNorm = useMemo(() => {
    const map = new Map<string, CatalogEntry>();
    for (const c of catalog ?? []) {
      const key = normalizeExerciseName(c.name);
      if (!map.has(key)) map.set(key, c);
    }
    return map;
  }, [catalog]);

  const preview: { workouts: ImportWorkout[]; exercises: PreviewExercise[]; sets: number; warmups: number; from: string; to: string } | null = useMemo(() => {
    if (!parsed) return null;
    const exMap = new Map<string, PreviewExercise>();
    let sets = 0;
    let warmups = 0;
    for (const w of parsed.workouts) {
      for (const ex of w.exercises) {
        const cur = exMap.get(ex.name) ?? { name: ex.name, matched: catalogByNorm.has(normalizeExerciseName(ex.name)), sets: 0 };
        cur.sets += ex.sets.length;
        exMap.set(ex.name, cur);
        sets += ex.sets.length;
        warmups += ex.sets.filter((s) => s.setType === "warmup").length;
      }
    }
    const dates = parsed.workouts.map((w) => w.startIso).sort();
    return {
      workouts: parsed.workouts,
      exercises: [...exMap.values()].sort((a, b) => b.sets - a.sets),
      sets,
      warmups,
      from: dates[0]?.slice(0, 10) ?? "",
      to: dates[dates.length - 1]?.slice(0, 10) ?? "",
    };
  }, [parsed, catalogByNorm]);

  async function onFile(file: File) {
    // A 200 MB export read fully into memory would hang the tab — cap early.
    if (file.size > 25 * 1024 * 1024) {
      setFileName(file.name);
      setParseError("That file is over 25 MB. Split the export by date range and import the parts.");
      return;
    }
    setFileName(file.name);
    setParseError(null);
    setParsed(null);
    setResult(null);
    setProgress(null);
    const text = await file.text();
    // papaparse loads on demand: the import page stays light until a file lands.
    const { default: Papa } = await import("papaparse");
    const papa = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    if (papa.errors.length > 0 && (papa.data?.length ?? 0) === 0) {
      setParseError(`Could not parse CSV: ${papa.errors[0]?.message ?? "unknown error"}`);
      return;
    }
    const headers = papa.meta.fields ?? [];
    const kind = source === "auto" ? detectSource(headers) : source;
    if (!kind) {
      setParseError("Not a Hevy or Strong export. Hevy needs exercise_title + start_time columns; Strong needs Exercise Name + Workout Name.");
      return;
    }
    const rows = (papa.data ?? []) as Record<string, string>[];
    const res = kind === "hevy" ? parseHevy(rows) : parseStrong(rows, strongUnit);
    if (res.workouts.length === 0) {
      setParseError(`No usable workouts found (${res.errors.length} row errors). Check the dry-run details after fixing the file.`);
    }
    setParsed(res);
    try {
      setCatalog(await getCatalogNameMapAction());
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Could not load the exercise catalog");
    }
  }

  async function onImport() {
    if (!parsed || !preview || importing) return;
    setImporting(true);
    setResult(null);
    let done = 0;
    let workouts = 0;
    let sets = 0;
    let skipped = 0;
    let created = 0;
    const failed: { title: string; error: string }[] = [];
    try {
      // Chunk by workouts so no single request carries the whole history.
      const chunks: ImportWorkout[][] = [];
      let current: ImportWorkout[] = [];
      let currentSets = 0;
      for (const w of parsed.workouts) {
        const n = w.exercises.reduce((a, e) => a + e.sets.length, 0);
        if (current.length > 0 && currentSets + n > 300) {
          chunks.push(current);
          current = [];
          currentSets = 0;
        }
        current.push(w);
        currentSets += n;
      }
      if (current.length > 0) chunks.push(current);
      setProgress({ done: 0, total: parsed.workouts.length });
      for (const chunk of chunks) {
        const res = await importBatchAction({
          targetUnit,
          workouts: chunk.map((w) => ({
            title: w.title,
            startIso: w.startIso,
            endIso: w.endIso,
            notes: w.notes,
            fileUnit: parsed.fileUnit,
            exercises: w.exercises.map((ex) => {
              const match = catalogByNorm.get(normalizeExerciseName(ex.name));
              return {
                ref: match
                  ? { kind: "catalog", external_id: match.external_id } as const
                  : { kind: "custom", name: ex.name.trim().slice(0, 120) } as const,
                fallbackName: ex.name.trim().slice(0, 120),
                notes: ex.notes,
                sets: ex.sets.map((s) => ({
                  weight: s.weight,
                  reps: s.reps,
                  rpe: s.rpe,
                  setType: s.setType,
                })),
              };
            }),
          })),
        });
        workouts += res.importedWorkouts;
        sets += res.importedSets;
        skipped += res.skippedExisting;
        created += res.createdExercises;
        failed.push(...res.failed);
        done += chunk.length;
        setProgress({ done, total: parsed.workouts.length });
      }
      setResult({ workouts, sets, skipped, created, failed });
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Import failed partway — re-running skips what already landed.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionTitle>1 · Source file</SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          {(["auto", "hevy", "strong"] as const).map((s) => (
            <button
              key={s}
              aria-pressed={source === s}
              onClick={() => setSource(s)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${source === s ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}
            >
              {s === "auto" ? "Auto-detect" : s === "hevy" ? "Hevy" : "Strong"}
            </button>
          ))}
          {(source === "strong" || (source === "auto" && parsed?.source === "strong")) && (
            <label className="ml-2 flex items-center gap-2 text-sm text-zinc-500">
              File unit (your Strong setting)
              <select
                name="strongUnit"
                autoComplete="off"
                value={strongUnit}
                onChange={(e) => setStrongUnit(e.target.value as "kg" | "lb")}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
              >
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </select>
            </label>
          )}
          <label className="ml-2 flex items-center gap-2 text-sm text-zinc-500">
            Import into
            <select
              name="targetUnit"
              autoComplete="off"
              value={targetUnit}
              onChange={(e) => setTargetUnit(e.target.value as "kg" | "lb")}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </label>
        </div>
        <label className="mt-3 block cursor-pointer rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 hover:border-zinc-400 focus-within:ring-2 focus-within:ring-teal-600 dark:border-zinc-700">
          {fileName ?? "Choose a Hevy or Strong CSV export"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </label>
        {parseError ? <p role="alert" className="mt-2 text-sm text-red-600">{parseError}</p> : null}
      </Card>

      {parsed && preview ? (
        <Card>
          <SectionTitle>2 · Dry run — check before importing</SectionTitle>
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <div><p className="text-xs text-zinc-500">Workouts</p><p className="text-xl font-bold">{preview.workouts.length}</p></div>
            <div><p className="text-xs text-zinc-500">Sets</p><p className="text-xl font-bold">{preview.sets}</p></div>
            <div><p className="text-xs text-zinc-500">Range</p><p className="text-sm font-semibold">{preview.from} → {preview.to}</p></div>
            <div><p className="text-xs text-zinc-500">Warm-ups</p><p className="text-xl font-bold">{preview.warmups}</p></div>
          </div>
          <p className="mb-1 text-sm font-medium">Exercises ({preview.exercises.length})</p>
          <ul className="mb-3 max-h-48 space-y-1 overflow-y-auto text-sm">
            {preview.exercises.map((ex) => (
              <li key={ex.name} className="flex items-center justify-between gap-2">
                <span className="truncate">{ex.name} <span className="text-zinc-500">· {ex.sets} sets</span></span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${ex.matched ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
                  {ex.matched ? "Matched" : "New — will be created"}
                </span>
              </li>
            ))}
          </ul>
          {parsed.errors.length > 0 ? (
            <div className="mb-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <p className="font-semibold">{parsed.errors.length} rows skipped</p>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
                {parsed.errors.slice(0, 20).map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}
              </ul>
            </div>
          ) : null}
          {parsed.warnings.length > 0 ? (
            <p className="mb-3 text-sm text-amber-700 dark:text-amber-300">{parsed.warnings.length} warnings (timed sets, skipped markers) — counts above already reflect them.</p>
          ) : null}
          <button
            onClick={() => void onImport()}
            disabled={importing || preview.workouts.length === 0}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {importing && progress ? `Importing ${progress.done}/${progress.total}…` : `Import ${preview.workouts.length} workouts`}
          </button>
          {result ? (
            <div className="mt-2 text-sm" aria-live="polite">
              <p className="text-emerald-700 dark:text-emerald-300">
                Done: {result.workouts} workouts, {result.sets} sets{result.skipped > 0 ? `, ${result.skipped} already existed (skipped)` : ""}{result.created > 0 ? `, ${result.created} new exercises created` : ""}. They appear in Workouts and sync to mobile.
              </p>
              {result.failed.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-red-600 dark:text-red-400">
                  {result.failed.map((f, i) => <li key={i}>{f.title}: {f.error}</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}
          <p className="mt-2 text-xs text-zinc-500">Re-running is safe: workouts that already exist are skipped.</p>
        </Card>
      ) : !parsed && !parseError ? (
        <EmptyState title="No file yet" description="Export from Hevy (Profile → Settings → Export) or Strong (Profile → Settings → Export Strong Data), then drop the CSV here." />
      ) : null}
    </div>
  );
}
