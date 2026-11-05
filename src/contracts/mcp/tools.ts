/**
 * Incline MCP server contract (AI-PLATFORM §3, #242): the tool list and the
 * pure logic behind it — argument parsing, exercise name matching and the
 * training math. The edge function (supabase/functions/incline-mcp) does the
 * reads and writes; everything here is pure so vitest covers it.
 *
 * Bump MCP_SERVER_VERSION when a tool's shape changes.
 */
export const MCP_SERVER_NAME = 'incline';
export const MCP_SERVER_VERSION = '1.0.0';
export const MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;

export const MAX_ROUTINE_EXERCISES = 20;
export const MAX_LIST_LIMIT = 50;
export const KG_PER_LB = 0.45359237;

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint: false };
}

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const limit = (dflt: number) => ({ type: 'integer', minimum: 1, maximum: MAX_LIST_LIMIT, default: dflt });

export const TOOLS: ToolDef[] = [
  {
    name: 'get_profile',
    title: 'Profile',
    description: 'The user\'s training profile: goal, experience level, preferred unit, latest bodyweight. Call first to know which unit to talk in.',
    inputSchema: obj({}),
    annotations: READ,
  },
  {
    name: 'list_routines',
    title: 'List routines',
    description: 'The user\'s own routines (workout templates) with exercise count and estimated minutes.',
    inputSchema: obj({ limit: limit(30) }),
    annotations: READ,
  },
  {
    name: 'get_routine',
    title: 'Routine detail',
    description: 'One routine\'s exercises in order with target sets, rep range, rest and notes.',
    inputSchema: obj({ routine_id: { type: 'string', description: 'id from list_routines' } }, ['routine_id']),
    annotations: READ,
  },
  {
    name: 'list_workouts',
    title: 'Workout history',
    description: 'Logged workouts, newest first: date, name, duration, completed sets and volume.',
    inputSchema: obj({
      limit: limit(10),
      since: { type: 'string', description: 'ISO date; only workouts on or after it' },
    }),
    annotations: READ,
  },
  {
    name: 'get_workout',
    title: 'Workout detail',
    description: 'Every set of one logged workout, grouped by exercise.',
    inputSchema: obj({ workout_id: { type: 'string', description: 'id from list_workouts' } }, ['workout_id']),
    annotations: READ,
  },
  {
    name: 'get_exercise_history',
    title: 'Exercise history',
    description: 'Per-session best set and estimated 1RM for one exercise, newest first. Use for progress and next-load questions.',
    inputSchema: obj({ exercise: { type: 'string', description: 'Exercise name, e.g. "bench press"' }, limit: limit(10) }, ['exercise']),
    annotations: READ,
  },
  {
    name: 'get_personal_records',
    title: 'Personal records',
    description: 'Best estimated 1RM and heaviest completed set per exercise.',
    inputSchema: obj({ limit: limit(20) }),
    annotations: READ,
  },
  {
    name: 'get_training_summary',
    title: 'Training summary',
    description: 'Sessions per week and hard sets per muscle per week over recent weeks (a set counts fully for the primary muscle, half for each secondary). Use to judge volume and balance.',
    inputSchema: obj({ weeks: { type: 'integer', minimum: 1, maximum: 12, default: 4 } }),
    annotations: READ,
  },
  {
    name: 'search_exercises',
    title: 'Search exercises',
    description: 'Find exercises by name in the user\'s library (bundled, catalog and custom). Use the returned names in create_routine.',
    inputSchema: obj({
      query: { type: 'string' },
      equipment: { type: 'string', description: 'e.g. barbell, dumbbell, cable, machine, bodyweight, band, kettlebell' },
      limit: limit(15),
    }, ['query']),
    annotations: READ,
  },
  {
    name: 'create_routine',
    title: 'Create routine',
    description:
      'Save a NEW routine to the user\'s library; it appears in the app on next sync. Never changes or deletes existing routines: to change one, create a version named "<name> (<Version>)". Exercise names are matched to the library; unmatched names fail the call with suggestions, so check with search_exercises first. Confirm the plan with the user before calling.',
    inputSchema: obj(
      {
        name: { type: 'string', maxLength: 60 },
        description: { type: 'string', maxLength: 280 },
        exercises: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_ROUTINE_EXERCISES,
          items: obj(
            {
              exercise: { type: 'string' },
              sets: { type: 'integer', minimum: 1, maximum: 10 },
              reps_min: { type: 'integer', minimum: 1, maximum: 100 },
              reps_max: { type: 'integer', minimum: 1, maximum: 100 },
              rest_seconds: { type: 'integer', minimum: 0, maximum: 600 },
              notes: { type: 'string', maxLength: 200 },
            },
            ['exercise', 'sets', 'reps_min'],
          ),
        },
      },
      ['name', 'exercises'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

export const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || null;
}

function int(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

export function argLimit(args: Record<string, unknown>, dflt: number): number {
  return int(args.limit, 1, MAX_LIST_LIMIT) ?? dflt;
}

export function argText(args: Record<string, unknown>, key: string, max = 120): string | null {
  return text(args[key], max);
}

export interface RoutineRowInput {
  exercise: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  notes: string;
}

export interface CreateRoutineInput {
  name: string;
  description: string;
  rows: RoutineRowInput[];
}

export function parseCreateRoutine(raw: unknown): Parsed<CreateRoutineInput> {
  if (!isRecord(raw)) return { ok: false, error: 'arguments must be an object' };
  const name = text(raw.name, 60);
  if (!name) return { ok: false, error: 'name is required' };
  if (!Array.isArray(raw.exercises) || raw.exercises.length === 0) return { ok: false, error: 'exercises must be a non-empty array' };
  if (raw.exercises.length > MAX_ROUTINE_EXERCISES) return { ok: false, error: `at most ${MAX_ROUTINE_EXERCISES} exercises` };
  const rows: RoutineRowInput[] = [];
  for (const [i, item] of raw.exercises.entries()) {
    if (!isRecord(item)) return { ok: false, error: `exercises[${i}] must be an object` };
    const exercise = text(item.exercise, 80);
    const sets = int(item.sets, 1, 10);
    let repsMin = int(item.reps_min, 1, 100);
    let repsMax = int(item.reps_max, 1, 100) ?? repsMin;
    if (!exercise || sets === null || repsMin === null || repsMax === null) {
      return { ok: false, error: `exercises[${i}] needs exercise, sets and reps_min` };
    }
    if (repsMin > repsMax) [repsMin, repsMax] = [repsMax, repsMin];
    rows.push({ exercise, sets, repsMin, repsMax, restSeconds: int(item.rest_seconds, 0, 600) ?? 90, notes: text(item.notes, 200) ?? '' });
  }
  return { ok: true, value: { name, description: text(raw.description, 280) ?? '', rows } };
}

/** A candidate the name matcher can pick. `ref` is the synced reference. */
export interface ExerciseCandidate {
  ref: ExerciseRef;
  name: string;
  aliases: string[];
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
}

export type ExerciseRef =
  | { refType: 'catalog'; externalId: string }
  | { refType: 'custom'; userExerciseId: string };

export function refKey(ref: ExerciseRef): string {
  return ref.refType === 'custom' ? `custom:${ref.userExerciseId}` : `catalog:${ref.externalId}`;
}

/** Synced rows carry `seed:N` (current) or `seed_N` (early builds) for bundled exercises. */
export function seedIdFromExternal(externalId: string | null | undefined): number | null {
  const m = /^seed[:_](\d+)$/.exec(externalId ?? '');
  return m ? Number(m[1]) : null;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/\bdumbbells?\b/g, 'db')
    .replace(/\bbarbell\b/g, 'bb')
    .replace(/[^a-z0-9]+/g, ' ')
    // Plurals only on real words: "fs" (front squat) must not become "f".
    .replace(/\b(\w{3,}?)s\b/g, '$1')
    .trim();
}

/**
 * Best candidate for a typed name, or null. Exact name/alias wins, then one
 * name containing the other, then the most shared words (≥ 2 or all of a
 * one-word query). Ties go to the earlier candidate, so callers order their
 * list by preference (custom, bundled, catalog).
 */
export function matchExercise(query: string, candidates: ExerciseCandidate[]): ExerciseCandidate | null {
  return rankExercises(query, candidates, 1)[0] ?? null;
}

export function rankExercises(query: string, candidates: ExerciseCandidate[], max: number): ExerciseCandidate[] {
  const q = normalizeName(query);
  if (!q) return [];
  const qWords = new Set(q.split(' '));
  const scored: { c: ExerciseCandidate; score: number; i: number }[] = [];
  candidates.forEach((c, i) => {
    const names = [c.name, ...c.aliases].map(normalizeName);
    let score = 0;
    if (names.includes(q)) score = 100;
    // Prefix matches need a real word on the short side ("bp" is not a prefix of "bpm curl").
    else if (names.some((n) => (q.length >= 4 && n.startsWith(q)) || (n.length >= 4 && q.startsWith(n)))) score = 60;
    else if (names.some((n) => n.includes(q))) score = 50;
    else {
      const words = normalizeName(c.name).split(' ');
      const shared = words.filter((w) => qWords.has(w)).length;
      if (shared >= 2 || (shared === 1 && qWords.size === 1)) score = 10 + shared * 10 - Math.abs(words.length - qWords.size);
    }
    if (score > 0) scored.push({ c, score, i });
  });
  scored.sort((a, b) => b.score - a.score || a.c.name.length - b.c.name.length || a.i - b.i);
  return scored.slice(0, max).map((s) => s.c);
}

/** Catalog (ExerciseDB) vocabulary → the app's; same maps as src/db/seed-supabase.ts. */
const CATALOG_MUSCLE: Record<string, string> = {
  pectorals: 'chest',
  lats: 'back',
  'upper back': 'back',
  'lower back': 'back',
  spine: 'back',
  'levator scapulae': 'traps',
  'serratus anterior': 'chest',
  quadriceps: 'quads',
  delts: 'shoulders',
  deltoids: 'shoulders',
  'rear deltoids': 'shoulders',
  abs: 'core',
  abdominals: 'core',
  obliques: 'core',
  'hip flexors': 'core',
};
const CATALOG_EQUIPMENT: Record<string, string> = {
  'body weight': 'bodyweight',
  assisted: 'bodyweight',
  weighted: 'bodyweight',
  'smith machine': 'machine',
  'leverage machine': 'machine',
  'sled machine': 'other',
  'resistance band': 'band',
  roller: 'other',
};
/** The catalog spells secondaries freely ("upper-back", "Quadriceps"); fold them onto app muscles. */
export const catalogMuscle = (m: string): string => {
  const key = m.toLowerCase().replace(/[-_]+/g, ' ').trim();
  return CATALOG_MUSCLE[key] ?? key;
};
export const catalogEquipment = (e: string): string => CATALOG_EQUIPMENT[e] ?? e;

/** Epley estimate; reps above 12 say little about a max, so they don't count. */
export function estimate1rm(weightKg: number, reps: number): number | null {
  if (!(weightKg > 0) || !(reps >= 1) || reps > 12) return null;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

export type Unit = 'metric' | 'imperial';

export function toUnit(kg: number, unit: Unit): number {
  const v = unit === 'imperial' ? kg / KG_PER_LB : kg;
  return Math.round(v * 10) / 10;
}

export function unitLabel(unit: Unit): 'kg' | 'lb' {
  return unit === 'imperial' ? 'lb' : 'kg';
}

/** ~2.5 min per working set plus a 5 min warm-up (same as the in-app estimate). */
export function estimateRoutineMinutes(rows: { sets: number }[]): number {
  const sets = rows.reduce((n, r) => n + r.sets, 0);
  return sets === 0 ? 0 : Math.round(5 + sets * 2.5);
}

export interface SetForSummary {
  startedAt: string;
  primaryMuscle: string | null;
  secondaryMuscles: string[];
}

/**
 * Hard sets per muscle per week: 1 for the primary muscle, 0.5 for each
 * secondary (the fractional counting common in volume research). Weeks are
 * counted back from `now` in 7-day blocks; 0 = the current week.
 */
export function weeklyMuscleSets(sets: SetForSummary[], weeks: number, now: number): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const bump = (muscle: string, week: number, by: number) => {
    (out[muscle] ??= Array.from({ length: weeks }, () => 0))[week]! += by;
  };
  for (const s of sets) {
    const week = Math.floor((now - Date.parse(s.startedAt)) / (7 * 86_400_000));
    if (!(week >= 0 && week < weeks)) continue;
    if (s.primaryMuscle && s.primaryMuscle !== 'other') bump(s.primaryMuscle, week, 1);
    for (const m of s.secondaryMuscles) if (m !== s.primaryMuscle && m !== 'other') bump(m, week, 0.5);
  }
  return out;
}
