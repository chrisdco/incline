/**
 * CSV import parsers (Hevy + Strong) — pure functions, no I/O.
 * Researched against Liftosaur's Hevy importer and Strong's documented
 * export shape. Everything uncertain (dates, set-order markers, units) is
 * handled defensively: bad rows become numbered errors in the dry-run,
 * never silent drops.
 */

export interface ImportSet {
  weight: number;
  reps: number;
  rpe: number | null;
  setType: "working" | "warmup";
}

export interface ImportExercise {
  name: string;
  notes: string;
  sets: ImportSet[];
}

export interface ImportWorkout {
  title: string;
  startIso: string;
  endIso: string;
  notes: string;
  exercises: ImportExercise[];
}

export interface ParseIssue {
  row: number;
  message: string;
}

export interface ParseResult {
  source: "hevy" | "strong";
  /** kg when the file carries metric, lb when imperial (Strong: chosen by user). */
  fileUnit: "kg" | "lb";
  workouts: ImportWorkout[];
  errors: ParseIssue[];
  warnings: ParseIssue[];
}

type Row = Record<string, string>;

function header(row: Row, ...names: string[]): string {
  const keys = Object.keys(row);
  for (const n of names) {
    const hit = keys.find((k) => k.trim().toLowerCase() === n);
    if (hit) return (row[hit] ?? "").trim();
  }
  return "";
}

function num(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDate(raw: string, row: number, errors: ParseIssue[]): string | null {
  const t = raw.trim();
  if (!t) return null;
  let d = new Date(t);
  if (Number.isNaN(d.getTime())) d = new Date(t.replace(/,/g, ""));
  if (Number.isNaN(d.getTime())) {
    errors.push({ row, message: `Unparseable date: "${raw}"` });
    return null;
  }
  return d.toISOString();
}

function parseDuration(raw: string): number {
  const t = raw.trim();
  if (!t) return 0;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.max(0, Math.floor(Number(t)));
  const parts = t.split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return 0;
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return Math.max(0, seconds);
}

function detectHevy(headers: string[]): boolean {
  const lower = headers.map((h) => h.trim().toLowerCase());
  return lower.includes("exercise_title") && lower.includes("start_time");
}

function detectStrong(headers: string[]): boolean {
  const lower = headers.map((h) => h.trim().toLowerCase());
  return lower.includes("exercise name") && lower.includes("workout name");
}

export function detectSource(headers: string[]): "hevy" | "strong" | null {
  if (detectHevy(headers)) return "hevy";
  if (detectStrong(headers)) return "strong";
  return null;
}

/** Parse Hevy rows (already header-parsed). Row numbers are 2-based (header = 1). */
export function parseHevy(rows: Row[]): ParseResult {
  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];
  const hasKg = rows.some((r) => num(header(r, "weight_kg")) != null);
  const fileUnit = hasKg ? "kg" : "lb";

  const byWorkout = new Map<string, Row[]>();
  rows.forEach((r, i) => {
    const key = header(r, "start_time") || `__row${i}`;
    const list = byWorkout.get(key) ?? [];
    list.push({ ...r, __row: String(i + 2) });
    byWorkout.set(key, list);
  });

  const workouts: ImportWorkout[] = [];
  for (const [, wrows] of byWorkout) {
    const rowNo = Number(wrows[0].__row);
    const startIso = parseDate(header(wrows[0], "start_time"), rowNo, errors);
    if (!startIso) continue;
    const endIso = parseDate(header(wrows[0], "end_time"), rowNo, errors) ?? startIso;
    const byExercise = new Map<string, Row[]>();
    for (const r of wrows) {
      const name = header(r, "exercise_title");
      if (!name) {
        warnings.push({ row: Number(r.__row), message: "Skipped a set with no exercise name" });
        continue;
      }
      const list = byExercise.get(name) ?? [];
      list.push(r);
      byExercise.set(name, list);
    }
    const exercises: ImportExercise[] = [];
    for (const [name, erows] of byExercise) {
      erows.sort((a, b) => (num(header(a, "set_index")) ?? 0) - (num(header(b, "set_index")) ?? 0));
      const sets: ImportSet[] = [];
      for (const r of erows) {
        const w = num(header(r, fileUnit === "kg" ? "weight_kg" : "weight_lbs")) ?? 0;
        const reps = num(header(r, "reps")) ?? 1;
        const setType = header(r, "set_type").toLowerCase() === "warmup" ? "warmup" : "working";
        sets.push({ weight: w, reps, rpe: null, setType });
      }
      exercises.push({ name, notes: header(erows[0], "exercise_notes").replace(/\\n/g, "\n"), sets });
    }
    if (exercises.length === 0) {
      warnings.push({ row: rowNo, message: "Skipped a workout with no usable exercises" });
      continue;
    }
    workouts.push({
      title: header(wrows[0], "title") || "Imported workout",
      startIso,
      endIso,
      notes: header(wrows[0], "description").replace(/\\n/g, "\n"),
      exercises,
    });
  }
  return { source: "hevy", fileUnit, workouts, errors, warnings };
}

/** Parse Strong rows. `unit` is the user's Strong app setting (not in the file). */
export function parseStrong(rows: Row[], unit: "kg" | "lb"): ParseResult {
  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];
  const byWorkout = new Map<string, Row[]>();
  rows.forEach((r, i) => {
    const key = `${header(r, "date")}||${header(r, "workout name")}`;
    const list = byWorkout.get(key) ?? [];
    list.push({ ...r, __row: String(i + 2) });
    byWorkout.set(key, list);
  });

  const workouts: ImportWorkout[] = [];
  for (const [, wrows] of byWorkout) {
    const rowNo = Number(wrows[0].__row);
    const startIso = parseDate(header(wrows[0], "date"), rowNo, errors);
    if (!startIso) continue;
    const duration = parseDuration(header(wrows[0], "duration"));
    const endIso = new Date(new Date(startIso).getTime() + duration * 1000).toISOString();
    const notes = [header(wrows[0], "workout notes")].filter(Boolean).join("\n");

    const byExercise = new Map<string, Row[]>();
    for (const r of wrows) {
      const name = header(r, "exercise name");
      if (!name) {
        warnings.push({ row: Number(r.__row), message: "Skipped a set with no exercise name" });
        continue;
      }
      const list = byExercise.get(name) ?? [];
      list.push(r);
      byExercise.set(name, list);
    }
    const exercises: ImportExercise[] = [];
    for (const [name, erows] of byExercise) {
      const sets: ImportSet[] = [];
      const notesParts = new Set<string>();
      for (const r of erows) {
        const order = header(r, "set order");
        if (!/^\d+$/.test(order)) {
          if (/^w/i.test(order)) {
            // Warm-up marker — falls through to warmup below.
          } else {
            warnings.push({ row: Number(r.__row), message: `Skipped non-set row (order "${order}")` });
            continue;
          }
        }
        const setType = /^w/i.test(order) ? "warmup" : "working";
        const weight = num(header(r, "weight")) ?? 0;
        let reps = num(header(r, "reps")) ?? 0;
        const seconds = num(header(r, "seconds")) ?? 0;
        if ((!reps || reps <= 0) && seconds > 0) {
          reps = 1;
          warnings.push({ row: Number(r.__row), message: "Timed set imported as 1 rep" });
        }
        if ((!reps || reps <= 0) && (num(header(r, "distance")) ?? 0) > 0) {
          reps = 1;
          warnings.push({ row: Number(r.__row), message: "Cardio set imported as 1 rep" });
        }
        const rpeRaw = num(header(r, "rpe"));
        const rpe = rpeRaw != null && rpeRaw >= 1 && rpeRaw <= 10 ? Math.round(rpeRaw) : null;
        const note = header(r, "notes");
        if (note) notesParts.add(note);
        sets.push({ weight, reps: reps || 0, rpe, setType });
      }
      if (sets.length > 0) exercises.push({ name, notes: [...notesParts].join("\n"), sets });
    }
    if (exercises.length === 0) {
      warnings.push({ row: rowNo, message: "Skipped a workout with no usable sets" });
      continue;
    }
    workouts.push({
      title: header(wrows[0], "workout name") || "Imported workout",
      startIso,
      endIso,
      notes,
      exercises,
    });
  }
  return { source: "strong", fileUnit: unit, workouts, errors, warnings };
}

/** Normalize names for catalog matching: lowercase, drop "(Barbell)"-style suffixes. */
export function normalizeExerciseName(name: string): string {
  return name.toLowerCase().replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

export function convertWeight(value: number, from: "kg" | "lb", to: "kg" | "lb"): number {
  if (from === to) return value;
  const converted = from === "kg" ? value * 2.20462 : value / 2.20462;
  return Math.round(converted * 100) / 100;
}
