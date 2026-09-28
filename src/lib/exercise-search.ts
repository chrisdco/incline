/**
 * Shared exercise-search primitives: normalize, tokenize, score.
 * Pure (no DB) so both the SQLite ranker and the web mirror use it.
 *
 * Design (Hevy lessons baked in):
 * - Order-free token matching ("press bench" finds "Bench Press").
 * - Typo tolerance via Damerau-Levenshtein (transpositions are the gym typo).
 * - Light plural folding ("curls" matches "curl").
 * - Equipment parens become tokens ("(Barbell)" is searchable, not noise).
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

/**
 * Plural-fold a single token for matching.
 * Conservative on purpose: words ending in ss/us/is (press, class,
 * latissimus) are never stripped. Known miss: -es plurals of e-words
 * ("raises" -> "rais") — the typo-tolerance layer below still matches those
 * at distance 1, so stemming stays dumb and safe on purpose.
 */
export function singularize(token: string): string {
  if (token.length <= 3) return token;
  if (/(ss|us|is)$/.test(token)) return token;
  if (token.endsWith('ies') && token.length > 4) return token.slice(0, -3) + 'y';
  if (/(s|x|z|ch|sh)es$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('s')) return token.slice(0, -1);
  return token;
}

export function tokenize(raw: string): string[] {
  const norm = normalizeSearchText(raw);
  if (!norm) return [];
  return norm.split(' ').map(singularize).filter(Boolean);
}

/** Build the stored search blob: name + muscle + equipment + pattern. */
export function buildSearchText(parts: {
  name: string;
  primaryMuscle?: string | null;
  equipment?: string | null;
  pattern?: string | null;
  category?: string | null;
}): string {
  return normalizeSearchText(
    [parts.name, parts.primaryMuscle ?? '', parts.equipment ?? '', parts.pattern ?? '', parts.category ?? '']
      .join(' '),
  );
}

/**
 * Damerau-Levenshtein distance (adjacent transposition costs 1).
 * Bounded inputs only — callers gate length first.
 */
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

/** Typo budget by token length: short tokens must nearly match. */
export function typoBudget(token: string): number {
  if (token.length <= 3) return 0;
  if (token.length <= 5) return 1;
  return 2;
}

export type TokenMatchLevel = 'exact' | 'prefix' | 'substring' | 'fuzzy' | 'none';

/** Best match of one query token against a set of candidate tokens. */
export function matchToken(queryToken: string, candidates: string[]): TokenMatchLevel {
  let best: TokenMatchLevel = 'none';
  const rank: Record<TokenMatchLevel, number> = { none: -1, fuzzy: 0, substring: 1, prefix: 2, exact: 3 };
  for (const c of candidates) {
    let level: TokenMatchLevel = 'none';
    if (c === queryToken) level = 'exact';
    else if (c.startsWith(queryToken)) level = 'prefix';
    else if (c.includes(queryToken)) level = 'substring';
    else if (
      Math.abs(c.length - queryToken.length) <= 2 &&
      damerauLevenshtein(queryToken, c) <= typoBudget(queryToken)
    ) {
      level = 'fuzzy';
    }
    if (rank[level] > rank[best]) {
      best = level;
      if (best === 'exact') return best;
    }
  }
  return best;
}

export type MatchedOn = 'name' | 'alias' | 'muscle' | 'equipment' | 'pattern' | 'fuzzy';

export interface RankedField {
  score: number;
  matchedOn: MatchedOn;
}

/**
 * Score query tokens against one field (name or alias set).
 * Returns null when any token misses (AND semantics across tokens).
 */
export function scoreField(
  queryTokens: string[],
  fieldTokens: string[],
  opts: { exact: number; prefix: number; substring: number; fuzzy: number; matchedOn: MatchedOn },
): RankedField | null {
  if (queryTokens.length === 0 || fieldTokens.length === 0) return null;
  let worst = 3;
  let fuzzyUsed = false;
  const rank = { fuzzy: 0, substring: 1, prefix: 2, exact: 3 } as const;
  for (const q of queryTokens) {
    const level = matchToken(q, fieldTokens);
    if (level === 'none') return null;
    if (level === 'fuzzy') fuzzyUsed = true;
    worst = Math.min(worst, rank[level]);
  }
  const score = worst === 3 ? opts.exact : worst === 2 ? opts.prefix : worst === 1 ? opts.substring : opts.fuzzy;
  return { score, matchedOn: fuzzyUsed && worst === 0 ? 'fuzzy' : opts.matchedOn };
}
