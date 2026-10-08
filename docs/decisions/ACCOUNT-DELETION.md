# Account deletion with a grace period — design (all free tier)

> Status: **shipped dark, off by default.** No external users yet, so every
> entry point is flagged off (mobile `ACCOUNT_DELETION_ENABLED`, web
> `ACCOUNT_DELETION_ENABLED`, cron gated on the repo variable). Enabling is
> three flips, no code changes — see "Go-live checklist" below.

Hevy deletes permanently and immediately, with no recovery. This keeps the
self-serve spirit but adds what users asked for: the account and its data
stick around for 30 days before the wipe, and signing back in cancels it.

## Model: deactivate now, purge later

- **Request** (mobile Profile or web Settings): one self-serve `INSERT` into
  `account_deletions` (`supabase/account-deletions.sql`). RLS lets users
  insert/select/delete only their own row; a `CHECK` caps the window at 31
  days so clients cannot forge it. No privileged request route needed.
- **Immediately**: the requesting device wipes local data (`resetUserData`)
  and signs out — lost-device privacy on the spot.
- **During grace**: the mobile gate (`src/app/index.tsx`) sees the flag and
  shows the scheduled screen instead of the app — no push, no pull. Web
  Settings shows the scheduled banner with an Undo button. Cancel = delete
  the flag row; cloud rows were never tombstoned, so the next sync restores
  everything automatically. Undo is genuinely free.
- **Purge**: daily GitHub Actions cron (free) POSTs to
  `web/src/app/api/account/purge/route.ts` with `CRON_SECRET`. The route runs
  on service role: storage prefix, all user tables child-first, the flag row,
  then the Clerk user via backend API. Idempotent and re-runnable.

## Why this shape (vs tombstone-now)

Tombstoning cloud rows at request time would require restore bookkeeping to
cancel. Deactivation needs none: cancel deletes one flag row and sync does
the restore. The 30-day window matches platform norms; purge (not anonymize)
because ownerless training rows are useless and still feel retained.

## Cost: $0 extra

| Piece | How | Cost |
|---|---|---|
| Scheduler | GitHub Actions cron (this repo) | Free |
| Purge compute | Next.js route on existing hosting | Free |
| Clerk user delete | Backend API with existing secret | Free tier |
| Storage/DB | Existing Supabase project | No change |

## Secrets to set

- Web hosting env: `SUPABASE_SERVICE_ROLE_KEY` (server-only, never public),
  `CLERK_SECRET_KEY` (already), `CRON_SECRET` (generate: 32+ random bytes).
- GitHub repo secrets: `WEB_URL` (deployed web origin), `CRON_SECRET` (same).
- Run `supabase/account-deletions.sql` once in the SQL editor.
- Mobile needs no new env (reads the flag over the existing sync backend).

## Open before building further

- Decide whether future coach/admin roles (#78) can see scheduled accounts.
- Out-of-scope: per-workout retention controls, shared accounts.

## Go-live checklist (when real users arrive)

1. Mobile: set `ACCOUNT_DELETION_ENABLED = true` in `src/constants/config.ts`.
2. Web hosting env: `ACCOUNT_DELETION_ENABLED=true` (plus `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`).
3. GitHub repo variable: `ACCOUNT_DELETION_ENABLED=true` (arms the purge cron).
4. Run `supabase/account-deletions.sql` once in the SQL editor.
5. Gym-smoke the matrix in this doc's predecessor section: schedule → second
   device shows the screen → Undo → data back after sync.
