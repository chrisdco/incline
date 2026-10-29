/**
 * Fuzzy-match imported exercise names (Strong / Hevy) to the local catalog.
 * Pure: the caller passes the catalog it already has cached (catalogQuery).
 *
 * Ladder, best first:
 *  1. exact   — normalised full name (or alias) equal → confident
 *  2. core    — names equal once equipment words are stripped, and the
 *               equipment agrees (or only one candidate exists) → confident;
 *               several candidates with no equipment agreement → review
 *  3. fuzzy   — token overlap (Dice) ≥ 0.6 on the core → review
 *  4. none    — becomes a custom exercise
 *
 * "Normalise" = lowercase, "&" → "and", punctuation → space, plural "s"
 * trimmed per token. "Core" additionally drops equipment words and pulls the
 * equipment out of "(Barbell)" / "Dumbbell …" so it can be compared.
 */

export type MatchEquipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'kettlebell'
  | 'bodyweight'
  | 'band'
  | 'other';

export interface CatalogCandidate {
  id: number;
  name: string;
  aliases: string[];
  equipment: MatchEquipment;
}

export type MatchConfidence = 'confident' | 'review' | 'none';

export interface ExerciseMatch {
  importName: string;
  exerciseId: number | null;
  confidence: MatchConfidence;
  /** Equipment inferred from the import name (used for new custom exercises). */
  equipment: MatchEquipment;
}

const EQUIPMENT_WORDS: Record<string, MatchEquipment> = {
  barbell: 'barbell',
  bb: 'barbell',
  ez: 'barbell',
  dumbbell: 'dumbbell',
  db: 'dumbbell',
  machine: 'machine',
  smith: 'machine',
  cable: 'cable',
  kettlebell: 'kettlebell',
  kb: 'kettlebell',
  bodyweight: 'bodyweight',
  weighted: 'bodyweight',
  assisted: 'machine',
  band: 'band',
  resistance: 'band',
};

/** Equipment words that are stripped from the core but don't decide equipment. */
const NOISE_WORDS = new Set(['bar', 'plate', 'loaded', 'lever']);

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((t) => (t.length >= 3 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us') ? t.slice(0, -1) : t));
}

export function normaliseName(name: string): string {
  return tokens(name).join(' ');
}

export function splitEquipment(name: string): { core: string; equipment: MatchEquipment | null } {
  let equipment: MatchEquipment | null = null;
  const core: string[] = [];
  for (const t of tokens(name)) {
    const eq = EQUIPMENT_WORDS[t];
    if (eq) {
      equipment ??= eq;
      continue;
    }
    if (NOISE_WORDS.has(t)) continue;
    core.push(t);
  }
  return { core: core.join(' '), equipment };
}

function dice(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

interface IndexedCandidate {
  c: CatalogCandidate;
  cores: string[];
}

export interface CatalogIndex {
  byFull: Map<string, CatalogCandidate>;
  byCore: Map<string, IndexedCandidate[]>;
  all: IndexedCandidate[];
}

/** Build once per preview; O(catalog) and then O(1)-ish per name. */
export function indexCatalog(catalog: readonly CatalogCandidate[]): CatalogIndex {
  const byFull = new Map<string, CatalogCandidate>();
  const byCore = new Map<string, IndexedCandidate[]>();
  const all: IndexedCandidate[] = [];
  for (const c of catalog) {
    const names = [c.name, ...c.aliases];
    const cores = new Set<string>();
    for (const n of names) {
      const full = normaliseName(n);
      if (full && !byFull.has(full)) byFull.set(full, c);
      const core = splitEquipment(n).core;
      if (core) cores.add(core);
    }
    const entry = { c, cores: [...cores] };
    all.push(entry);
    for (const core of cores) {
      const list = byCore.get(core) ?? [];
      list.push(entry);
      byCore.set(core, list);
    }
  }
  return { byFull, byCore, all };
}

export const FUZZY_THRESHOLD = 0.6;

export function matchExerciseName(importName: string, index: CatalogIndex): ExerciseMatch {
  const { core, equipment } = splitEquipment(importName);
  const eq = equipment ?? 'other';
  const exact = index.byFull.get(normaliseName(importName));
  if (exact) return { importName, exerciseId: exact.id, confidence: 'confident', equipment: eq };

  const sameCore = core ? (index.byCore.get(core) ?? []) : [];
  if (sameCore.length > 0) {
    const sameEq = equipment ? sameCore.filter((e) => e.c.equipment === equipment) : [];
    if (sameEq.length > 0) return { importName, exerciseId: sameEq[0].c.id, confidence: 'confident', equipment: eq };
    if (sameCore.length === 1 && !equipment) {
      return { importName, exerciseId: sameCore[0].c.id, confidence: 'confident', equipment: eq };
    }
    return { importName, exerciseId: sameCore[0].c.id, confidence: 'review', equipment: eq };
  }

  let best: { score: number; c: CatalogCandidate } | null = null;
  if (core) {
    for (const e of index.all) {
      for (const cc of e.cores) {
        let score = dice(core, cc);
        if (equipment && e.c.equipment === equipment) score += 0.05;
        if (!best || score > best.score) best = { score, c: e.c };
      }
    }
  }
  if (best && best.score >= FUZZY_THRESHOLD) {
    return { importName, exerciseId: best.c.id, confidence: 'review', equipment: eq };
  }
  return { importName, exerciseId: null, confidence: 'none', equipment: eq };
}

export function matchExerciseNames(names: readonly string[], catalog: readonly CatalogCandidate[]): ExerciseMatch[] {
  const index = indexCatalog(catalog);
  return names.map((n) => matchExerciseName(n, index));
}
