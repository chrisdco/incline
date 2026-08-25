# Agent handoff — read this after `git pull`

Last updated: **2026-08-25** (two-week plan in [SPRINT-2026-08.md](./SPRINT-2026-08.md)).

## Current product state

- **Branch:** `main` — sync-fidelity work merged via [#127](https://github.com/chrisdco/incline/pull/127); lockfile regenerated so `npm ci` works on Linux CI
- **Schema version:** 16 (`016_photo_sync_metadata`)
- **Status:** Pre-alpha; offline-first logger. Core workout/profile sync plus RPE/set type/supersets, circumference, custom programs, account preferences, last-session ghost, and private photo backup (deploy + two-device restore still required)

## What landed via #127

- **#119 / #120** — set `set_type` / `rpe` / `superset_group` round-trip; unknown outbox tables retry instead of ack-drop; `body_measurements` outbox + LWW
- **#121** — custom programs + slots; seed templates referenced by stable integer id; active program as UUID or seed id; pull cursor does not advance past a blocked child
- **#122** — account preferences (theme, rest defaults, ghost flag, …). Device-local: haptics, reminders, screen-awake, AI opt-in
- **#38** — “Last time” on workout preview + live session (working-set volume; extra warm-ups cannot win)
- **#123 / #124** — private `workout-photos` bucket, metadata JSON sync (no bytes in outbox), compressed JPEG persist, durable blob queue drained after JSON sync

## Deploy required

Re-run `supabase/sync-schema.sql` (new tables: `body_measurements`, `user_programs`, `user_program_workouts`, `user_active_program`, `user_preferences`, `workout_photos`, private Storage bucket). Confirm live `set_entries` already has `set_type` / `rpe` / `superset_group`.

**#99 coach-narrate** dashboard deploy is still required from earlier work.

## Recommended next work

Plan and small-agent slices: **[docs/SPRINT-2026-08.md](./SPRINT-2026-08.md)** (18–31 Aug).

1. Deploy the SQL above; two-device matrix for workouts, programs, prefs, photos
2. Close #57 / #109 / #38 after that matrix (do not close on merge alone)
3. Week 2: pick **one** track in the sprint doc (session alerts, #126 volume, or #99 polish)
4. Later: signed photo URLs (#125) after #78; native Google (#112)

## Architecture constraints (do not break)

- Auth is **Clerk** (JWT template `supabase` for cloud). Do not reintroduce Supabase Auth.
- SQLite + outbox = source of truth; coaching is **recomputed**, not synced
- Session logging must never await network, AI, or photo upload
- Photo `uri` is a local file path only — never `getPublicUrl` / signed URLs in SQLite
- Seed program/template UUIDs are random per device — never FK those

## Verify locally

```bash
npm run typecheck
npm run lint
npm run test
```

## Deferred (explicit)

- #83 GC / field-level LWW / SyncClient
- Chat coach / program generation / model keys in app
- Public/friends (#78) and signed photo delivery (#125)
- Native Google account sheet (#112)
- Changing stored `total_volume` analytics (#126)
