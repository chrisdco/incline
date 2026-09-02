/**
 * Exercise illustration resolution against the bryllim/workout-guide catalog
 * (302 exercises x 3 SVG frames, CC BY-SA 4.0 assets).
 *
 * The generated name->slug map comes from scripts/gen-illustration-map.mjs;
 * this module adds runtime fuzzy fallback so custom/unmapped names still get
 * a best-effort illustration without any database writes.
 */

import { ALL_SLUGS, ILLUSTRATION_ASSETS_BASE, NAME_TO_SLUG } from './generated/illustration-map';

/** Tokens describing equipment/setup that are stripped for looser matching. */
const EQUIP_TOKENS = new Set([
  'barbell', 'dumbbell', 'db', 'bb', 'cable', 'machine', 'lever', 'smith', 'band',
  'resistance', 'bodyweight', 'weighted', 'assisted', 'kettlebell', 'kb',
  'ez', 'rope', 'plate', 'bar', 'flat',
]);

/** Curated synonyms normalization alone cannot resolve (mirrors the generator). */
const ALIASES: Record<string, string> = {
  crunches: 'crunch',
  'rear delt fly': 'bent-over-rear-delt-raise',
  'reverse fly': 'bent-over-rear-delt-raise',
  'reverse flyes': 'bent-over-rear-delt-raise',
  'cable crossover': 'cable-fly',
  'low cable crossover': 'cable-fly',
  'farmers walk': 'farmer-carry',
  "farmer's walk": 'farmer-carry',
  'ab wheel': 'ab-wheel',
  'ab rollout': 'ab-wheel',
  'mountain climbers': 'mountain-climber',
  'toe touches': 'toe-touch',
  woodchopper: 'cable-woodchop',
  'wood chop': 'cable-woodchop',
  'lying leg curl': 'leg-curl',
  'hamstring curl': 'leg-curl',
  'chest supported row': 'chest-supported-row',
  'single arm dumbbell row': 'one-arm-dumbbell-row',
  'one arm row': 'one-arm-dumbbell-row',
  'dumbbell row single arm': 'one-arm-dumbbell-row',
  'seated cable row': 'seated-row',
  'seated row': 'seated-row',
  'seated hip abduction': 'banded-seated-hip-abduction',
  'standing hip abduction': 'cable-standing-hip-abduction',
  'hip abduction': 'hip-abduction-machine',
  'standing hip adduction': 'cable-standing-hip-adduction',
  'hip adduction': 'hip-adduction-machine',
  'chest press': 'machine-chest-press',
  'shoulder press': 'machine-shoulder-press',
  // Curl variants: the catalog names the movement "Bicep Curl".
  'barbell curl': 'bicep-curl',
  'dumbbell curl': 'bicep-curl',
  'db curl': 'bicep-curl',
  'bb curl': 'bicep-curl',
};

/** Alias keys are matched against fully normalized names. */
const NORMALIZED_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(ALIASES).map(([key, slug]) => [normalizeExerciseName(key), slug]),
);

export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function singularize(token: string): string {
  if (/ies$/.test(token) && token.length > 4) return `${token.slice(0, -3)}y`;
  if (/ches|shes|xes$/.test(token) && token.length > 4) return token.slice(0, -2);
  if (/ss$/.test(token)) return token;
  if (/s$/.test(token) && token.length > 3) return token.slice(0, -1);
  return token;
}

function canonTokens(name: string): string[] {
  const fixed: Record<string, string> = { ups: 'up', raises: 'raise', presses: 'press', squats: 'squat' };
  return normalizeExerciseName(name)
    .split(' ')
    .filter(Boolean)
    .map((t) => fixed[t] ?? t)
    .map(singularize);
}

/** Ordered lookup keys derived from a name (compounds, equipment-stripped, aliases). */
function candidateKeys(name: string): string[] {
  const tokens = canonTokens(name);
  const keys: string[] = [];
  const push = (arr: string[]) => {
    const k = arr.join(' ');
    if (k && !keys.includes(k)) keys.push(k);
  };
  push(tokens);
  // Hyphen-compound candidates: "push up" -> "push-up", "t bar row" -> "t-bar-row".
  for (let i = 0; i < tokens.length - 1; i++) {
    const copy = [...tokens];
    copy.splice(i, 2, `${tokens[i]}-${tokens[i + 1]}`);
    push(copy);
  }
  push(tokens.map((t) => t.replace(/-/g, '')));
  const stripped = tokens.filter((t) => !EQUIP_TOKENS.has(t));
  if (stripped.length !== tokens.length && stripped.length >= 1) {
    push(stripped);
    for (let i = 0; i < stripped.length - 1; i++) {
      const copy = [...stripped];
      copy.splice(i, 2, `${stripped[i]}-${stripped[i + 1]}`);
      push(copy);
    }
  }
  // Semantic alias lookup on both the full and equipment-stripped forms.
  const fullKey = tokens.join(' ');
  const strippedKey = stripped.join(' ');
  const alias = NORMALIZED_ALIASES[fullKey] ?? NORMALIZED_ALIASES[strippedKey];
  if (alias) keys.push(alias);
  return keys;
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/**
 * Resolve an exercise name (+ optional known aliases) to an illustrated slug,
 * or null when nothing plausible exists.
 */
export function resolveIllustrationSlug(name: string, aliases: readonly string[] = []): string | null {
  const keys = candidateKeys(name);
  for (const alias of aliases) {
    if (normalizeExerciseName(alias) === normalizeExerciseName(name)) continue;
    keys.unshift(...candidateKeys(alias));
  }
  for (const key of keys) {
    if (!key) continue;
    const hyphenated = key.split(' ').join('-');
    if ((ALL_SLUGS as readonly string[]).includes(hyphenated)) return hyphenated;
    if (NAME_TO_SLUG[key]) return NAME_TO_SLUG[key];
  }
  const target = canonTokens(name).filter((t) => !EQUIP_TOKENS.has(t));
  if (target.length === 0) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const slug of ALL_SLUGS) {
    const score = jaccard(target, slug.split('-'));
    if (score < 0.5) continue;
    // Deterministic tie-break: higher score first, then fewer slug tokens,
    // then lexicographic — keeps results stable across runs.
    if (
      best === null ||
      score > bestScore ||
      (score === bestScore &&
        (slug.split('-').length < best.split('-').length ||
          (slug.split('-').length === best.split('-').length && slug < best)))
    ) {
      bestScore = score;
      best = slug;
    }
  }
  return best;
}

/** All three frame URLs for a slug (frame 1 is the canonical static pose). */
export function getIllustrationFrames(slug: string): string[] {
  return [1, 2, 3].map((n) => `${ILLUSTRATION_ASSETS_BASE}/${slug}/frame-${n}.svg`);
}
