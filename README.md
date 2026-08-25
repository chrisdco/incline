# Incline

Offline-first strength training app for React Native + Expo. Log sets in the gym, follow programs and routines, and get **explainable progressive overload** suggestions from your own history — even without a network.

> **Status:** pre-alpha. Core loop (onboard → log → finish → progress) works locally. Cloud sync is **implemented in code** (Clerk JWT + Supabase outbox/RLS) but **ops are not fully proven** for multi-device yet — see [#57](https://github.com/ChrisDc777/incline/issues/57). Accounts (Clerk) are required.

**Product north star:** the offline coach that tells you the next weight/reps, shows *why*, and knows when to hold — not another social logger.

## What’s in the app today

### Logging & gym UX
- Live sessions: weight/reps, warm-up sets (`set_type`), previous-session carry-over, one-tap complete, undo
- Rest timer: per-exercise / after-superset, OS alerts, sound + haptics
- Supersets / circuits on templates and in-session
- Templates (routines), program builder (local), Quick Start

### Habit loops
- Dynamic Home context cards (reports, inactivity, weekly goal, coaching, announcements)
- Workout reminders + optional Sunday weekly digest (local notifications)
- Weekly / monthly recaps and share slides
- Calendar heatmap, weekly streak, weekly workout goal
- Bodyweight + circumference measures; JSON/CSV export (incl. measurements)

### Coaching (offline rules — Stage A–C)
- Plate-aware double progression with reason codes
- Fatigue cues, deload suggestions, optional RPE chips, daily readiness check-in
- User-confirmed program-week diffs (catch-up / lighter day) at `/(app)/program-adjust`
- Surfaces: workout preview, session assist, post-workout “Next time”, Home insight card
- Rules live in `src/coaching/`; suggestions are recomputed from SQLite (not synced)

### Progress & tools
- Volume, estimated 1RM / PRs, muscle distribution, achievements
- Progress photo compare (local session pics, week vs week) — Progress → Photos
- Plate calculator, 1RM / bodyweight tools
- Settings: units, theme, accent, rest defaults, calendar prefs, reminders, optional AI explanations

### Trust & identity
- Clerk email auth (mandatory)
- Local SQLite source of truth; sync outbox → Supabase when configured
- Soft-delete / UUID-ready rows; Settings “Backup & restore” triggers sync

## What is *not* ready yet

| Area | Notes |
|------|--------|
| Sync ops | Deploy schema + multi-device verification — [#57](https://github.com/ChrisDc777/incline/issues/57) |
| Cloud AI narrations | Code shipped ([#99](https://github.com/ChrisDc777/incline/issues/99)); deploy Edge Function + secrets still required |
| Photo cloud sync | Local compare shipped ([#23](https://github.com/ChrisDc777/incline/issues/23)); Storage later — [#109](https://github.com/ChrisDc777/incline/issues/109) |
| Social / Health / marketplace | P3+ |

## Docs for humans & agents

| Doc | Purpose |
|-----|---------|
| [docs/HANDOFF.md](docs/HANDOFF.md) | **Start here after `git pull`** — current state, next issues |
| [docs/SPRINT-2026-08.md](docs/SPRINT-2026-08.md) | Two-week plan (prove sync) + small-agent slices |
| [docs/P1-P2-COACHING.md](docs/P1-P2-COACHING.md) | P1 habit closeout + P2 coaching (Stages A–C) |
| [ROADMAP.md](ROADMAP.md) | Milestones P0–P4 |
| [AGENTS.md](AGENTS.md) | Agent entry (Expo SDK 57 + doc pointers) |

Tracking: [GitHub milestones](https://github.com/ChrisDc777/incline/milestones).

## Tech stack

| Layer | Technology |
|-------|------------|
| App | Expo SDK 57, React Native 0.86, Expo Router |
| UI | NativeWind v4, Reanimated, Lucide, Gifted Charts, FlashList, Geist |
| Local data | expo-sqlite (schema v16, incl. photo metadata), Zustand + SQLite `kv` |
| Auth | Clerk (`@clerk/clerk-expo`) |
| Cloud | Supabase (exercise catalog + user sync tables / RLS) |
| Coaching | Pure TypeScript rules in `src/coaching/` (no model keys in the app) |

## Getting started

Prerequisites: Node 20+, Expo tooling for device/simulator.

```bash
npm install
cp .env.example .env.local   # fill Clerk (required); Supabase optional for catalog/sync
npx expo start
# npx expo start --android | --ios
```

### Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Auth |
| `EXPO_PUBLIC_SUPABASE_URL` | No* | Catalog + sync |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | No* | Catalog + sync |

\*Without Supabase, the app uses the bundled exercise catalog and stays fully local. Sync needs a deployed `supabase/sync-schema.sql` and a Clerk JWT template named `supabase`.

## Project structure (high level)

```
src/
├── app/                 # Expo Router routes (auth, onboarding, tabs, session, reports…)
├── components/          # UI, workout, progress, home context cards
├── coaching/            # Offline overload + insight rules
├── db/                  # Schema, migrations, queries (incl. coaching/)
├── sync/                # Outbox → Supabase engine
├── lib/                 # Home context, announcements, notifications, export…
├── store/               # Settings, active workout
├── hooks/               # Data, rest timer, sync, reminders
└── auth/                # Clerk secure token cache
docs/                    # HANDOFF, P1-P2 coaching notes
supabase/                # Catalog + sync SQL
```

## Verify

```bash
npm run typecheck
npm run test
npm run lint
```

## License

Private — not for distribution.
