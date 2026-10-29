/**
 * CSV import parsers (Hevy + Strong) — pure functions, no I/O.
 * Researched against Liftosaur's Hevy importer and Strong's documented
 * export shape. Everything uncertain (dates, set-order markers, units) is
 * handled defensively: bad rows become numbered errors in the dry-run,
 * never silent drops.
 *
 * Shared by the Expo app (src/lib/import) and the web companion (re-exported
 * from web/src/lib/csv-import.ts). Keep it dependency-free: no path aliases,
 * no platform APIs. Known date shapes are parsed by hand first because
 * Hermes' `Date.parse` rejects Hevy's "15 Jan 2024, 18:30" and Strong's
 * "2024-01-15 18:30:00".
 */

/** Mirrors the app's SET_TYPES (src/db/types.ts). */
export type ImportSetType = "working" | "warmup" | "drop" | "failure";

export interface ImportSet {
  weight: number;
  reps: number;
  rpe: number | null;
  setType: ImportSetType;
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

export const LB_PER_KG = 2.20462;

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

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Local-time parse of the two export shapes; null when neither matches. */
function parseKnownDate(t: string): Date | null {
  // Strong / ISO without zone: 2024-01-15 18:30:00 (local time).
  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  // Hevy: 15 Jan 2024, 18:30 (local time).
  m = /^(\d{1,2}) ([A-Za-z]{3})[A-Za-z]* (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month == null) return null;
    return new Date(+m[3], month, +m[1], +m[4], +m[5], +(m[6] ?? 0));
  }
  return null;
}

function parseDate(raw: string, row: number, errors: ParseIssue[]): string | null {
  const t = raw.trim();
  if (!t) return null;
  let d = parseKnownDate(t) ?? new Date(t);
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
  // Strong also writes "1h 5m" / "45m".
  const hm = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/.exec(t);
  if (hm && (hm[1] || hm[2] || hm[3])) return +(hm[1] ?? 0) * 3600 + +(hm[2] ?? 0) * 60 + +(hm[3] ?? 0);
  const parts = t.split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return 0;
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return Math.max(0, seconds);
}

function parseRpe(raw: string): number | null {
  const n = num(raw);
  return n != null && n >= 1 && n <= 10 ? Math.round(n) : null;
}

function parseUnit(raw: string): "kg" | "lb" | null {
  const t = raw.trim().toLowerCase();
  if (t === "kg" || t === "kgs") return "kg";
  if (t === "lb" || t === "lbs") return "lb";
  return null;
}

/** Hevy set_type: normal | warmup | dropset | failure. */
function hevySetType(raw: string): ImportSetType {
  const t = raw.trim().toLowerCase();
  if (t === "warmup") return "warmup";
  if (t === "dropset" || t === "drop") return "drop";
  if (t === "failure") return "failure";
  return "working";
}

/** Strong "Set Order": a number, or W (warm-up) / D (drop) / F (failure). */
function strongSetType(order: string): ImportSetType | null {
  if (/^\d+$/.test(order)) return "working";
  if (/^w/i.test(order)) return "warmup";
  if (/^d/i.test(order)) return "drop";
  if (/^f/i.test(order)) return "failure";
  return null;
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
        sets.push({ weight: w, reps, rpe: parseRpe(header(r, "rpe")), setType: hevySetType(header(r, "set_type")) });
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

/**
 * Parse Strong rows. `unit` is the user's Strong app setting (not in most
 * files); a per-row "Weight Unit" column, when present, is converted to it.
 */
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
        const setType = strongSetType(order);
        if (!setType) {
          warnings.push({ row: Number(r.__row), message: `Skipped non-set row (order "${order}")` });
          continue;
        }
        const rawWeight = num(header(r, "weight")) ?? 0;
        const rowUnit = parseUnit(header(r, "weight unit"));
        const weight = rowUnit && rowUnit !== unit ? convertWeight(rawWeight, rowUnit, unit) : rawWeight;
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
        const note = header(r, "notes");
        if (note) notesParts.add(note);
        sets.push({ weight, reps: reps || 0, rpe: parseRpe(header(r, "rpe")), setType });
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
  const converted = from === "kg" ? value * LB_PER_KG : value / LB_PER_KG;
  return Math.round(converted * 100) / 100;
}

/** Any weight → canonical kg (the storage rule), rounded to 0.01 kg. */
export function toKg(value: number, from: "kg" | "lb"): number {
  return convertWeight(value, from, "kg");
}

/**
 * Minimal RFC 4180 reader (quotes, doubled quotes, CRLF, embedded newlines,
 * BOM). The web keeps papaparse; the app uses this so it ships no CSV lib.
 */
export function parseCsvText(text: string): { headers: string[]; rows: Row[] } {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (src[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const nonEmpty = records.filter((r) => r.some((f) => f.trim() !== ""));
  const headers = (nonEmpty[0] ?? []).map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => {
    const row: Row = {};
    headers.forEach((h, i) => {
      row[h] = r[i] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

/** Detect + parse in one step. `strongUnit` applies only to Strong files. */
export function parseExportCsv(text: string, strongUnit: "kg" | "lb"): ParseResult | { error: string } {
  const { headers, rows } = parseCsvText(text);
  const source = detectSource(headers);
  if (!source) return { error: "Not a Strong or Hevy export (unrecognised columns)." };
  if (rows.length === 0) return { error: "The file has no rows." };
  return source === "hevy" ? parseHevy(rows) : parseStrong(rows, strongUnit);
}
