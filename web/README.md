# Incline Web

Browser companion to the Incline mobile app. **Read and review here, log on
mobile.** Same Clerk project, same Supabase project, same RLS — no new backend.

## Setup

```bash
cd web
cp .env.example .env.local   # fill in keys (see below)
npm install
npm run dev
```

| Variable | Where |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk dashboard, same app as mobile |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard, same project as mobile |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard — **server-only**, powers the purge route |
| `CRON_SECRET` | Generate (`openssl rand -hex 32`) — guards `/api/account/purge` |

The Supabase project must trust Clerk JWTs via a template named `supabase`
(Clerk dashboard → JWT Templates) — identical to the mobile setup. Row-level
policies already scope every table to `user_id = sub`.

Run `supabase/account-deletions.sql` once for the grace-period table. The
daily purge cron (`.github/workflows/account-purge.yml`, free) needs repo
secrets `WEB_URL` + `CRON_SECRET`. See `docs/ACCOUNT-DELETION.md`.

## What's here

Dashboard, Workouts (+ detail), Routines (+ detail), Programs (+ detail),
Exercises (search/filter + detail with progression and history), Progress,
Measurements, Reports (weekly recap), Export (browser-side CSV/JSON),
Settings (profile edit + synced prefs view). Social (feed/follows) is
deliberately out until the mobile social backend (#78) exists.

## Notes

- All data pages are server components (`force-dynamic`); charts and export
  are client components. No service keys anywhere — anon key + per-request
  Clerk token, mirroring mobile's trust boundary.
- Auth boundary: `src/proxy.ts` (Next 16 convention) + Clerk middleware;
  `/sign-in` is the only public route.
- UI: Tailwind v4 + `lucide-react` (same icon family as mobile) + Geist
  (same typeface as mobile) + `next-themes` class dark mode with toggle.
  Charts: Recharts v3 (bars/areas); the calendar heatmap is hand-rolled divs.
  Numbers render tabular (`font-variant-numeric`) so stats align.

## Agent skills (for AI-assisted work in this repo)

Installed project-wide under `.agents/skills/` (repo root) via
`npx skills add`. Reference them when writing or reviewing code:

- `vercel-react-best-practices` — 70 React/Next perf rules (waterfalls,
  bundles, server/client fetching, re-renders). Use on any web change.
- `web-design-guidelines` — 100+ UI rules (a11y, forms, animation,
  typography, dark mode, touch). Fetches fresh guidelines per review.
- `vercel-react-native-skills` — Expo/RN perf, lists, Reanimated, native
  modules. Use on any mobile change.

Deliberately **not** installed: Next.js workflow skills
(`next-cache-components-*`, `next-partial-prefetching-*`) — they assume
Cache Components/PPR, and this app is fully dynamic personal data.
`next-dev-loop` needs agent-browser + a running dev server; revisit if
manual verification becomes the bottleneck. Versioned framework reference
already ships inside `node_modules/next/dist/docs/` plus the generated
`web/AGENTS.md` — read those before writing app code.
- `npm run build` requires real env keys (pages read the session at build
  otherwise); CI should provide them or skip the web build.
- Error monitoring: Sentry is wired (client + server configs, error boundary
  capture) and stays disabled without `NEXT_PUBLIC_SENTRY_DSN`. Add the DSN
  when preview builds go to testers; the mobile app gets its own setup later.
- E2E: `npm run e2e` (Playwright, Chromium). Public specs need Clerk
  publishable + Supabase anon env; authed specs additionally need
  `E2E_TEST_EMAIL` + `E2E_TEST_PASSWORD` for a throwaway Clerk user and skip
  otherwise. CI runs them only when the repo variable `WEB_E2E_ENABLED` is
  `true` (job `if:` cannot read secrets) — see
  `.github/workflows/web.yml`.

## Roadmap (web phases)

- Done: CSV import (Hevy + Strong, dry-run, idempotent skips).
- Progress photos via signed URLs (private bucket, server-side).
- Coach narration surface (read `coach_narration_cache`, same honesty rules).
- Milestones, 1RM/plate calculators.
- Coach dashboard + admin panel (specs first; need the #78 grants model).
- Polish: motion micro-interactions, cmdk exercise search, OG cards, sitemap.
- Social (feed/follows) only with the mobile social backend (#78).
