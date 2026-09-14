/**
 * Exercise media coverage audit + illustration map generator.
 *
 * Sources:
 *  - Live Supabase `exercises` table (EXPO_PUBLIC_SUPABASE_URL/ANON_KEY from .env.local)
 *    -> falls back to the public ExerciseGymGifsDB JSON when the DB is unreachable.
 *  - bryllim/workout-guide manifest.json (302 exercises x 3 SVG frames, CC BY-SA 4.0).
 *
 * Outputs (all read-only against the database):
 *  - src/lib/generated/illustration-map.ts   runtime name->slug map (committed)
 *  - docs/exercise-media-audit.csv           Excel-openable coverage matrix
 *  - docs/exercise-media-audit-summary.md    human-readable stats
 *
 * Run: node scripts/gen-illustration-map.mjs [--no-db] [--skip-map]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const NO_DB = args.has('--no-db');
const SKIP_MAP = args.has('--skip-map');

const MANIFEST_URL =
  'https://cdn.jsdelivr.net/gh/bryllim/workout-guide@main/packages/workout-guide/manifest.json';
/**
 * Assets are NOT in the npm tarball and only exist on main — so we pin the
 * commit SHA that was audited. Bump after re-running the audit when upstream changes.
 */
export const ASSETS_BASE =
  'https://cdn.jsdelivr.net/gh/bryllim/workout-guide@ba0b709cb20430361b2cb33aaadd20998164a916/packages/workout-guide/assets';
const GIF_DB_URL =
  'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0/api/en/exercises.json';

/* ---------------- env ---------------- */

function loadEnv() {
  try {
    const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
    return env;
  } catch {
    return {};
  }
}

/* ---------------- name normalization + matching ---------------- */

// Tokens that describe equipment/setup and can be stripped for looser matching.
const EQUIP_TOKENS = new Set([
  'barbell', 'dumbbell', 'db', 'cable', 'machine', 'lever', 'smith', 'band',
  'resistance', 'bodyweight', 'weighted', 'assisted', 'kettlebell', 'kb',
  'ez', 'rope', 'plate', 'bar', 'flat',
]);

// Curated synonyms that pure normalization cannot resolve.
const ALIASES = {
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
  'woodchopper': 'cable-woodchop',
  'wood chop': 'cable-woodchop',
  'lying leg curl': 'leg-curl',
  'hamstring curl': 'leg-curl',
  'chest supported row': 'chest-supported-row',
  'single arm dumbbell row': 'one-arm-dumbbell-row',
  'one arm row': 'one-arm-dumbbell-row',
  'seated cable row': 'seated-row',
  'seated row': 'seated-row',
  'seated hip abduction': 'banded-seated-hip-abduction',
  'standing hip abduction': 'cable-standing-hip-abduction',
  'hip abduction': 'hip-abduction-machine',
  'standing hip adduction': 'cable-standing-hip-adduction',
  'hip adduction': 'hip-adduction-machine',
  'chest press': 'machine-chest-press',
  'shoulder press': 'machine-shoulder-press',
};

function normalize(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function singularize(token) {
  if (/ies$/.test(token) && token.length > 4) return `${token.slice(0, -3)}y`;
  if (/ches|shes|xes$/.test(token) && token.length > 4) return token.slice(0, -2);
  if (/ss$/.test(token)) return token;
  if (/s$/.test(token) && token.length > 3) return token.slice(0, -1);
  return token;
}

function canonTokens(name) {
  const fixed = { ups: 'up', raises: 'raise', presses: 'press', squats: 'squat' };
  return normalize(name)
    .split(' ')
    .filter(Boolean)
    .map((t) => fixed[t] ?? t)
    .map(singularize);
}

/** All lookup keys tried in order for a given exercise name. */
function candidateKeys(name) {
  const tokens = canonTokens(name);
  const keys = [];
  const push = (arr) => {
    const k = arr.join(' ');
    if (k && !keys.includes(k)) keys.push(k);
  };
  push(tokens);
  // Hyphen-compound candidates: push up -> push-up, t bar row -> t-bar-row
  push(tokens.map((t) => t));
  for (let i = 0; i < tokens.length - 1; i++) {
    const copy = [...tokens];
    copy.splice(i, 2, `${tokens[i]}-${tokens[i + 1]}`);
    push(copy);
  }
  push(tokens.map((t) => t.replace(/-/g, '')));
  // Equipment-stripped variant(s)
  const stripped = tokens.filter((t) => !EQUIP_TOKENS.has(t));
  if (stripped.length !== tokens.length && stripped.length >= 1) {
    push(stripped);
    for (let i = 0; i < stripped.length - 1; i++) {
      const copy = [...stripped];
      copy.splice(i, 2, `${stripped[i]}-${stripped[i + 1]}`);
      push(copy);
    }
  }
  const aliasKey = tokens.join(' ');
  if (ALIASES[aliasKey]) keys.push(ALIASES[aliasKey]);
  return keys;
}

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/**
 * Match an exercise name (+ optional known aliases) to a workout-guide slug.
 * Returns { slug, method } | null.
 */
export function matchSlug(name, slugSet, aliasMap = {}) {
  const keys = [...candidateKeys(name)];
  for (const alias of Object.keys(aliasMap ?? {})) {
    if (normalize(name) === normalize(alias)) {
      keys.unshift(...candidateKeys(alias));
      break;
    }
  }
  // Stage 1-3: deterministic key hits
  for (const key of keys) {
    if (!key) continue;
    if (slugSet.has(key.split(' ').join('-'))) return { slug: key.split(' ').join('-'), method: 'exact' };
  }
  for (const [alias, slug] of Object.entries(aliasMap)) {
    if (keys.includes(alias)) return { slug, method: 'alias' };
  }
  // Stage 4: best-effort token overlap
  const target = canonTokens(name).filter((t) => !EQUIP_TOKENS.has(t));
  if (target.length === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const slug of slugSet) {
    const score = jaccard(target, slug.split('-'));
    if (score > bestScore) {
      bestScore = score;
      best = slug;
    }
  }
  return bestScore >= 0.5 ? { slug: best, method: `fuzzy(${bestScore.toFixed(2)})` } : null;
}

/** Expand a manifest entry into extra normalized-name keys so runtime lookups hit.
 *  Deliberately excludes equipment-stripped variants — generic keys like `curl`
 *  would ambiguously hijack runtime lookups; semantic aliases live in the resolver. */
function expansionKeys(entryName) {
  const tokens = canonTokens(entryName);
  const out = new Set();
  const add = (arr) => {
    if (arr.length) out.add(arr.join('-'));
  };
  add(tokens);
  for (let i = 0; i < tokens.length - 1; i++) {
    const copy = [...tokens];
    copy.splice(i, 2, `${tokens[i]}-${tokens[i + 1]}`);
    add(copy);
  }
  add(tokens.map((t) => t.replace(/-/g, '')));
  return [...out];
}

/* ---------------- fetch sources ---------------- */

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchLiveCatalog() {
  const env = loadEnv();
  const base = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (NO_DB || !base || !key) return null;
  try {
    const rows = [];
    const PAGE = 500;
    for (let offset = 0; ; offset += PAGE) {
      const url = `${base}/rest/v1/exercises?select=id,external_id,name,equipment,target_muscle,category,gif_url&order=id&id=gte.${offset}`;
      const res = await fetch(url, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${offset}-${offset + PAGE - 1}` },
      });
      if (!res.ok) throw new Error(`Supabase HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const batch = await res.json();
      rows.push(...batch);
      if (batch.length < PAGE) break;
      if (offset > 20000) break;
    }
    return rows;
  } catch (err) {
    console.warn(`! Supabase query failed (${err.message}); falling back to public GIF-DB JSON.`);
    return null;
  }
}

async function fetchGifDbFallback() {
  const data = await fetchJson(GIF_DB_URL);
  const exercises = data.exercises ?? [];
  return exercises.map((ex, i) => ({
    id: i + 1,
    external_id: ex.id,
    name: ex.name,
    equipment: ex.equipment,
    target_muscle: ex.muscle,
    category: ex.category,
    gif_url: ex.gifUrl ?? '',
  }));
}

/* ---------------- main ---------------- */

async function main() {
  console.log('Fetching workout-guide manifest...');
  const manifest = await fetchJson(MANIFEST_URL);
  const slugs = manifest.map((e) => e.slug);
  const slugSet = new Set(slugs);
  console.log(`  ${manifest.length} illustrated exercises`);

  console.log('Fetching exercise catalog...');
  const catalog = (await fetchLiveCatalog()) ?? (await fetchGifDbFallback());
  const source = NO_DB ? 'gifdb-json' : loadEnv().EXPO_PUBLIC_SUPABASE_URL ? 'supabase' : 'gifdb-json';
  console.log(`  ${catalog.length} catalog exercises (source: ${source})`);

  /* Build runtime map from the manifest itself: every canonical name and its
     normalization/expansion variants map to the owning slug. */
  const nameToSlug = {};
  if (!SKIP_MAP) {
    for (const entry of manifest) {
      for (const key of expansionKeys(entry.name)) {
        if (!(key in nameToSlug)) nameToSlug[key] = entry.slug;
      }
    }
  }

  /* Audit every catalog row. */
  const rows = catalog.map((ex) => {
    const hasGif = Boolean(ex.gif_url && String(ex.gif_url).trim());
    const m = matchSlug(ex.name, slugSet, {});
    const frames = m ? [1, 2, 3].map((n) =>
      `${ASSETS_BASE}/${m.slug}/frame-${n}.svg`) : [];
    const status = hasGif && m ? 'both' : hasGif ? 'gif_only' : m ? 'illustration_only' : 'none';
    return {
      id: ex.id,
      external_id: ex.external_id ?? '',
      name: ex.name,
      equipment: ex.equipment ?? '',
      muscle: ex.target_muscle ?? '',
      category: ex.category ?? '',
      has_gif: hasGif,
      gif_url: String(ex.gif_url ?? ''),
      illustration_slug: m?.slug ?? '',
      match_method: m?.method ?? '',
      frame1: frames[0] ?? '',
      frame2: frames[1] ?? '',
      frame3: frames[2] ?? '',
      status,
    };
  });

  /* Summary */
  const count = (fn) => rows.filter(fn).length;
  const total = rows.length;
  const stats = {
    total,
    both: count((r) => r.status === 'both'),
    gif_only: count((r) => r.status === 'gif_only'),
    illustration_only: count((r) => r.status === 'illustration_only'),
    none: count((r) => r.status === 'none'),
    no_gif_total: count((r) => !r.has_gif),
    illustration_covers_no_gif: count((r) => !r.has_gif && r.illustration_slug),
    combined_coverage: count((r) => r.has_gif || r.illustration_slug),
  };
  const pct = (n) => `${((n / Math.max(total, 1)) * 100).toFixed(1)}%`;

  console.log('\n=== Coverage summary ===');
  console.log(`Total catalog:            ${stats.total}`);
  console.log(`Has GIF:                  ${stats.total - stats.no_gif_total} (${pct(stats.total - stats.no_gif_total)})`);
  console.log(`Missing GIF:              ${stats.no_gif_total} (${pct(stats.no_gif_total)})`);
  console.log(`  of which illustrated:   ${stats.illustration_covers_no_gif}`);
  console.log(`Illustration matched:     ${stats.both + stats.illustration_only} (${pct(stats.both + stats.illustration_only)})`);
  console.log(`Combined (gif OR illus):  ${stats.combined_coverage} (${pct(stats.combined_coverage)})`);
  console.log(`Neither:                  ${stats.none}`);

  const byEquip = {};
  for (const r of rows) {
    byEquip[r.equipment] ??= { total: 0, none: 0 };
    byEquip[r.equipment].total++;
    if (!r.has_gif && !r.illustration_slug) byEquip[r.equipment].none++;
  }
  console.log('\nPer-equipment "neither media" counts:');
  for (const [eq, s] of Object.entries(byEquip).sort((a, b) => b[1].none - a[1].none)) {
    if (s.none > 0) console.log(`  ${eq}: ${s.none}/${s.total}`);
  }

  /* CSV */
  mkdirSync(join(ROOT, 'docs'), { recursive: true });
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'id,external_id,name,equipment,muscle,category,has_gif,gif_url,illustration_slug,match_method,frame1,frame2,frame3,status';
  const csv = [
    header,
    ...rows.map((r) =>
      [r.id, r.external_id, r.name, r.equipment, r.muscle, r.category, r.has_gif, r.gif_url, r.illustration_slug, r.match_method, r.frame1, r.frame2, r.frame3, r.status]
        .map(esc)
        .join(','),
    ),
  ].join('\n');
  writeFileSync(join(ROOT, 'docs', 'exercise-media-audit.csv'), csv, 'utf8');

  /* Summary markdown */
  const neither = rows.filter((r) => r.status === 'none').map((r) => `- ${r.name} (${r.equipment})`);
  const md = [
    '# Exercise media audit',
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} from ${source}. See exercise-media-audit.csv for the full matrix.`,
    '',
    '| Metric | Count | % |',
    '| --- | --- | --- |',
    `| Total catalog | ${total} | 100% |`,
    `| Has GIF | ${total - stats.no_gif_total} | ${pct(total - stats.no_gif_total)} |`,
    `| Missing GIF | ${stats.no_gif_total} | ${pct(stats.no_gif_total)} |`,
    `| Illustration-matched | ${stats.both + stats.illustration_only} | ${pct(stats.both + stats.illustration_only)} |`,
    `| Combined coverage (gif OR illustration) | ${stats.combined_coverage} | ${pct(stats.combined_coverage)} |`,
    `| Neither media | ${stats.none} | ${pct(stats.none)} |`,
    '',
    '## Exercises with neither GIF nor illustration',
    ...(neither.length ? neither : ['- (none)']),
    '',
  ].join('\n');
  writeFileSync(join(ROOT, 'docs', 'exercise-media-audit-summary.md'), md, 'utf8');

  /* Runtime map */
  if (!SKIP_MAP) {
    const genDir = join(ROOT, 'src', 'lib', 'generated');
    mkdirSync(genDir, { recursive: true });
    const ts = [
      '// AUTO-GENERATED by scripts/gen-illustration-map.mjs — do not edit.',
      '// Slug catalog: bryllim/workout-guide (CC BY-SA 4.0 assets, MIT code).',
      '',
      '/** Normalized exercise-name variants mapped to an illustrated slug. */',
      `export const NAME_TO_SLUG: Record<string, string> = ${JSON.stringify(nameToSlug, null, 2)};`,
      '',
      '/** Every available illustration slug (302). Used for runtime fuzzy fallback. */',
      `export const ALL_SLUGS: readonly string[] = ${JSON.stringify(slugs)};`,
      '',
      '/** Commit-SHA-pinned CDN base for illustration SVGs (assets are not on npm). */',
      `export const ILLUSTRATION_ASSETS_BASE = ${JSON.stringify(ASSETS_BASE)};`,
      '',
    ].join('\n');
    writeFileSync(join(genDir, 'illustration-map.ts'), ts, 'utf8');
    console.log(`\nWrote src/lib/generated/illustration-map.ts (${Object.keys(nameToSlug).length} name keys)`);
  }

  console.log('Wrote docs/exercise-media-audit.csv and docs/exercise-media-audit-summary.md');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
