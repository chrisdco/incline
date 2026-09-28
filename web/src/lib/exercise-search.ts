/**
 * Exercise search scoring, mirrored from the mobile app
 * (`src/lib/exercise-search.ts` — the contract owner; keep the bands and
 * rules in sync when either side changes).
 *
 * Same pipeline: normalize → tokenize → score (exact/prefix/substring/fuzzy
 * per field, AND across tokens) → recency boost → sort.
 */

export function normalizeSearchText(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function singularize(token: string): string {
  if (token.length <= 3) return token;
  if (/(ss|us|is)$/.test(token)) return token;
  if (token.endsWith("ies") && token.length > 4) return token.slice(0, -3) + "y";
  if (/(s|x|z|ch|sh)es$/.test(token)) return token.slice(0, -2);
  if (token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function tokenize(raw: string): string[] {
  const norm = normalizeSearchText(raw);
  if (!norm) return [];
  return norm.split(" ").map(singularize).filter(Boolean);
}

export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const alen = a.length;
  const blen = b.length;
  if (alen === 0) return blen;
  if (blen === 0) return alen;
  const prev = new Array<number>(blen + 1);
  const curr = new Array<number>(blen + 1);
  let prevPrev: number[] = [];
  for (let j = 0; j <= blen; j++) prev[j] = j;
  for (let i = 1; i <= alen; i++) {
    curr[0] = i;
    for (let j = 1; j <= blen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prevPrev[j - 2] + 1);
      }
    }
    prevPrev = [...prev];
    for (let j = 0; j <= blen; j++) prev[j] = curr[j];
  }
  return curr[blen];
}

function typoBudget(token: string): number {
  if (token.length <= 3) return 0;
  if (token.length <= 5) return 1;
  return 2;
}

type Level = "exact" | "prefix" | "substring" | "fuzzy" | "none";

function matchToken(queryToken: string, candidates: string[]): Level {
  let best: Level = "none";
  const rank: Record<Level, number> = { none: -1, fuzzy: 0, substring: 1, prefix: 2, exact: 3 };
  for (const c of candidates) {
    let level: Level = "none";
    if (c === queryToken) level = "exact";
    else if (c.startsWith(queryToken)) level = "prefix";
    else if (c.includes(queryToken)) level = "substring";
    else if (Math.abs(c.length - queryToken.length) <= 2 && damerauLevenshtein(queryToken, c) <= typoBudget(queryToken)) {
      level = "fuzzy";
    }
    if (rank[level] > rank[best]) {
      best = level;
      if (best === "exact") return best;
    }
  }
  return best;
}

export interface FieldBands {
  exact: number;
  prefix: number;
  substring: number;
  fuzzy: number;
}

/** Score query tokens against one field; null when any token misses. */
export function scoreField(queryTokens: string[], fieldTokens: string[], bands: FieldBands): number | null {
  if (queryTokens.length === 0 || fieldTokens.length === 0) return null;
  let worst = 3;
  for (const q of queryTokens) {
    const level = matchToken(q, fieldTokens);
    if (level === "none") return null;
    worst = Math.min(worst, level === "exact" ? 3 : level === "prefix" ? 2 : level === "substring" ? 1 : 0);
  }
  return worst === 3 ? bands.exact : worst === 2 ? bands.prefix : worst === 1 ? bands.substring : bands.fuzzy;
}

/** Recency boost (Hevy move): top-10 recent +12, next-40 +6. */
export function recencyBonus(index: number): number {
  if (index < 0) return 0;
  return index < 10 ? 12 : 6;
}
