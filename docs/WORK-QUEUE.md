# Work queue — the only pickup list

> **GitHub milestones P0–P4 are the source of truth** for *what* is open
> (~105 open issues). This file is the *grouping + order + rules* so a
> pickup from any milestone still lands in a PR-sized slice with a known
> verification story. State lives in [HANDOFF.md](./HANDOFF.md).
>
> Replaces `REVIEW-BATCHES.md` (batches A–J), `AUDIT-2026-09.md` (84-item
> source critique, archived with its detail at
> [`archive/AUDIT-2026-09.md`](./archive/AUDIT-2026-09.md)), and the agent
> slices from `archive/SPRINT-2026-08.md`. Nothing was dropped: resolved
> audit decisions are kept at the bottom under “Resolved — no action”.

Feature ranking follows [decisions/PRODUCT-STRATEGY.md](./decisions/PRODUCT-STRATEGY.md) (how Incline beats incumbents and AI-first entrants).

Solo-dev rule: no parent issues. The project board (#2) is an optional view,
not a second tracker — milestones stay canonical. Batches are PR-sized: same
files, one verification story each. **Pick top-down (A → J).**

Deferred verification (Tier 3, later): Maestro E2E on an emulator in CI
(user flows plus kill-and-resume). Unit tests stay local-fast
(`pnpm test`); integration tests (`*.integration.test.ts`) run via
`pnpm run test:integration` in CI only. Hardware behaviors (haptics,
notifications, camera) stay manual gym-smoke.

## How to pick up work (one slice per session)

Rules for every slice:

- Take **one** slice. Name it in the first message (`Slice: rest-deeplink`).
- Do not expand into Week-2 Track A Live Activities, #126 volume rewrite, #83, or social.
- Do not rewrite `src/sync/engine.ts` unless the slice is a **matrix bugfix** with a failing case.
  (The Batch C protocol rewrite was an owner-approved exception; the rule stands again.)
- Session logging must never await network / AI / upload.
- Prefer a focused PR. Do not mix docs-only with behavior changes.

Safe anytime (lean / docs / copy):

| Slice | Why | Stay inside |
|----|-----|-------------|
| `lint-warnings` | Drive down pre-existing lint warnings without behavior change | One directory per session (`src/lib` or `src/app`) |
| `dead-exports` | Remove unused exports / imports in one module | One folder; no “while I’m here” refactors |

Build (only after a Week-2 track is picked — see bottom):

| Slice | Track | Stay inside |
|-------|-------|-------------|
| `abandoned-session` | A | New notif type + scheduler; Settings opt-in; no set-logging from the shade |
| `rest-lock` | A | Native rebuild required; gate on Rest timer alerts |
| `volume-definition` | B | #126; Progress / recap / ghost |
| `narrate-live` | C | #99 follow-up; never call from session complete |

Matrix bugfix (outranks everything): if Device B restore fails, open a
slice named after the failing row (`matrix-photos`, `matrix-programs`,
…). Fix only that path. Re-run the matching matrix row before merging.

Explicitly not slices: #94 measurement goals, #112 Google sheet, #78 / #125
signed public photos, #83, chat coach, program generation, logging a set
from a notification. (Android home-screen widgets shipped separately; they
are a surface, not a queue slice.)

## Ask memory — remaining (Phase 3, AI-CHAT §5)

Shipped: synced `coach_memory`, `remember` (Ask) + `get_memory` (Ask and
MCP), facts in the Ask prompt, "Saved to memory · Undo", What Incline knows.

- `memory-web`: What Incline knows page on web (read, edit, delete) from
  `src/contracts/ai/memory.ts`.
- `memory-extract`: end-of-thread extraction proposing ADD / UPDATE / DELETE
  as `suggested` facts (one cheap call after a quiet thread).
- `memory-temporary-chat`: composer toggle; sets `memory_off` (plumbed:
  `executeChatTurn({ memoryOff })` skips reading and `remember`).
- `memory-feedback`: rejecting the same exercise twice suggests "avoids X".
- `memory-decay`: "still true?" for goals/constraints after 8 weeks.

## Dumbbell weight — remaining

Shipped: per-exercise "Each / Total" (session ⋯ menu), account default in
Settings, `KG EACH` / `KG TOTAL` column header, `weight_is` in MCP / Ask
exercise history (`src/contracts/coaching/dumbbell-load.ts`).

- `dumbbell-web`: show "per dumbbell" / "both dumbbells" next to weights on
  web exercise and workout pages (read the same `user_preferences` payload).
- `dumbbell-workout-tool`: add `weight_is` to MCP / Ask `get_workout` sets for
  dumbbell exercises (history already has it).

## Routine changes + skip today — remaining

Shipped:
- Finishing asks Update / Save as new / Keep when a workout changed its routine's shape.
- Rest-only tweaks apply silently, with Undo.
- Version history with restore on the routine screen.
- **Skip today** on the exercise ⋯ menu.

See [decisions/ROUTINE-CHANGES.md](decisions/ROUTINE-CHANGES.md).

Remaining:
- `routine-versions-sync`: sync `template_versions` (Supabase table plus a pull/push spec) so web, MCP and a second device see earlier versions. Today they're device-local. Web and MCP already see the updated routine.
- `skip-in-history`: record skipped exercises on the log (a synced field) so Ask, MCP and web can say "skipped Bench, did Dips instead". Today a skip leaves no trace once finished.
- `routine-versions-ai`: AI template edits (`template-actions.ts`) save a version too, so every routine change lands in one history.

## Build 3 — next native build (planned 2026-11-27)

Native work collects on branch `release/build-3` and merges to `main` once,
so the deploy workflow builds one APK, not one per piece. OTA work lands on
`main` as usual and is checked on the current build. Lanes in one phase
touch different files and can run in parallel.

**Phase 0 (first):** create `release/build-3`; `app.config.ts` (Clerk ID,
per-profile `buildArchs`). Every native lane edits config, so this lands first.

**Phase 1: OTA, now**
- **1a. Settings:** the gear on Profile is the only way in; Profile keeps
  only your things; Appearance moves into Settings; Delete account goes to
  Settings → Account. **Search:** one static registry (title, keywords,
  synonyms, section, path) that both renders Settings and feeds search, so
  they never drift. In-memory filtering per keystroke, synonym and fuzzy
  matches ("kg" finds Units, "dark" finds Appearance), opens the row and
  flashes it.
- **1b. About + version:** done (#416): tap Version shares the details
  (copy is in the share sheet; a direct copy needs `expo-clipboard`, Phase 2 C).
- **1c. What's new v2** (#410). **Shipped:** levels (`note` / `announce` /
  `must-read`) in the contract, per-card in-app art at 2:1, changelog screen
  (Settings → About → What's new) with the low-noise New dot, web cards +
  recent changes. Fallback: `WHATS_NEW_STYLE = 'classic'` in
  `src/components/whats-new/whats-new-sheet.tsx`. MCP/Ask `get_changelog` shipped too. **Left:** (b) the deploy workflow posts `first_update_group_id` to
  `app-release` so each OTA links to its items; (c) build cover card + name.
  Original plan: levels (silent / line / card / must-read),
  changelog screen, update id recorded by the deploy workflow, web + Ask/MCP.
  Cards: one illustration or feature crop per card with a fixed aspect, so
  the carousel never jumps; images stay remote (cached) or SVG so OTAs stay
  small; accent tint; plain fade. **New dot without noise:** only items from
  the newest update, cleared on first open, gone after 7 days, at most 2 at
  once, never on the tab bar. Build cover card titled with the build name
  (decide naming with the first cover card).
- **1d. Health visible:** done: `healthStatusLine()` on Home, in Ask's
  readiness result, and per-type arrival on the Health screen. Plan was: Home says "Health connected, learning your
  baseline (n/5 days)" or "No sleep data from Samsung Health yet" in place of
  saying nothing; the Health screen lists which record types actually arrive.
- **1e. Polish:** rest-on-lock notification and widget alignment (user
  checked 2026-11-27; needs screenshots), the JS loading hand-off,
  abandoned-session ping (to Phase 2 if it needs a new channel).

**Phase 2: native, on `release/build-3`**
- **A. Health, both ways:** write finished workouts (via the outbox) so they
  show in Samsung Health; read nutrition (calories, macros) and use sleep +
  nutrition in performance insights ("after <6 h sleep your top sets ran
  ~4% lighter"). Shared rules in `src/contracts`, so Ask/MCP/web say the same.
  A rationale screen before each permission.
- **B. Music mini-bar (optional, off by default, Android):** media-session
  module after a one-time notification-access grant; title, art,
  play/pause/skip in the session screen; hidden when nothing is playing.
  iOS later (Apple Music/Spotify only).
- **C. Build polish:**

Things that need a new binary anyway; fold them into the next build, never
into an OTA (they change the runtime fingerprint, so OTAs stop reaching
installed builds).

    - **Smaller APK** (user, 2026-11-25: alpha APK is 134 MB). It's universal
  (arm64, arm32, x86, x86_64) with minify and shrink off. In `expo-build-properties`:
  `buildArchs: ['arm64-v8a']` for the sideloaded APK profiles (emulator keeps
  x86_64; production's AAB is already split by Play), plus
  `enableMinifyInReleaseBuilds` and `enableShrinkResourcesInReleaseBuilds`.
  Arch per profile needs an `app.config.ts` reading the profile (pairs with the
  Clerk item below). Check widgets, Health Connect and Clerk still work after
  R8 (keep rules), and note the size before and after.

  - **Fingerprint ignores `package.json` scripts.** Add `fingerprint.config.js` with `sourceSkips: SourceSkips.PackageJsonScriptsAll`. Then point `lint` / `typecheck` at oxlint and TS 7 (docs/decisions/LINT.md). Until then the scripts stay byte-identical.

  - **Clerk Google client ID in app config.** Add an `app.config.ts` that sets
  `extra.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID` from env, then delete the
  runtime hand-over in `src/auth/use-google-sign-in.ts` (#393). The hand-over
  works; this is the documented way and drops a mutation of Constants.
  - **Better loading screen** (user ask, 2026-11-18). Two halves: the native
  splash (`expo-splash-screen` config: logo, background per theme, dark
  variant) needs this build; the JS hand-off after it (DB open, migrations,
  first query) can ship by OTA. Goal: splash → content with no blank frame or
  bare spinner; hold the splash until the first screen's data is ready
  (`SplashScreen.preventAutoHideAsync` + hide on first render), then a short
  fade. Reference first: Apple/Material launch-screen guidance, Hevy/Strong
  cold starts. Measure cold start before and after.

  - Alpha build number auto-increments, so "Build 3" means something in About.
  - Sentry source maps on (Sentry is installed; uploads are off via
    `SENTRY_DISABLE_AUTO_UPLOAD`, needs an auth token from the user).
  - Edge-to-edge audit: SDK 58 already draws behind the system bars; check
    every screen's insets (no content under the status or nav bar).

**Phase 3: gate.** Merge `release/build-3` → workflow builds → fresh install
and upgrade from Build 2 → offline / empty account / Health read+write /
music / lock-screen rest / splash → size before/after → cover card ships.

## Verify-to-close (merged code, proof still owed)

Do not close these on merge alone. Proof is the two-device matrix
(Device A logs → sync → Device B fresh install, same Clerk user pulls)
or the stated smoke.

Deploy first (both still required):

- Re-run full `supabase/sync-schema.sql` (idempotent). **Blocking since #259:**
  it creates the `sync_push` RPC; until it is deployed every sync stops with
  “Sync server is out of date” and edits wait in the outbox.
- Confirm tables: `body_measurements`, `user_programs`,
  `user_program_workouts`, `user_active_program`, `user_preferences`,
  `workout_photos` (+ private Storage bucket `workout-photos`).
- Confirm live `set_entries` has `set_type` / `rpe` / `superset_group`.
- Set the `ai-task` secrets: `CLERK_FRONTEND_API` (so Clerk tokens verify) and
  `GROQ_API_KEY` (or `AI_API_KEY` + `AI_BASE_URL`). Without a key it serves the stub
  narration; `aiExplanationsEnabled` stays default off.

| Issue | Pass if |
|-------|---------|
| [#119](https://github.com/chrisdco/incline/issues/119) RPE / set type / supersets round-trip | B shows the same sets |
| [#120](https://github.com/chrisdco/incline/issues/120) Circumference via outbox + LWW | Measures match |
| [#121](https://github.com/chrisdco/incline/issues/121) Custom programs + active program (UUID or seed id) | B follows the same week/day |
| [#122](https://github.com/chrisdco/incline/issues/122) Account prefs (theme, rest defaults, ghost — not haptics/reminders) | Theme/rest match; reminders stay per device |
| [#213](https://github.com/chrisdco/incline/issues/213) Snackbar feedback with undo | Gym-smoke: undo restores, no collision with rest timer |
| [#214](https://github.com/chrisdco/incline/issues/214) Share capture outside native modals | Share works from modal-hosted screens |

Buffer rule: whatever the matrix finds (RLS, blocked pull cursor, photo
queue, account-switch wipe) outranks new features — file it as
`matrix-*` and fix only that path.

## Build 2 — next native build (planned 2026-11-13)

Goal: a fresh install on a real phone that feels clearly different. Over-the-air
work lands first; native pieces ship together in one build.

1. [x] **Ask Phase 2, rest (OTA):** "Ask about this" on cards across the app
   (Home, Progress, workout summary) opening a thread with the card attached;
   proposal cards from chat applied with one tap; the idle brief reuses the
   answer-card components. Done: exercise + workout summary + insight tiles
   (#371), proposal cards (#373), Home + Progress section links and brief
   answer cards.
2. [ ] **Native Google + Apple sign-in** (Clerk `useSignInWithGoogle` from
   `@clerk/expo/google`, `useSignInWithApple` + `expo-apple-authentication`).
   Needs Google Cloud OAuth clients (user): Android (package + SHA-1 of the EAS
   signing cert), iOS (bundle id), web (what Clerk verifies against). Browser
   SSO stays as fallback; email code stays.
   Android code merged (#379, `src/auth/use-google-sign-in.ts`), gated on
   `EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID`, now set in every eas.json
   profile (OAuth clients + Clerk done 2026-11-16). Apple: iOS phase.
3. [x] **Voice in Ask:** hold-to-talk, `expo-speech-recognition`, on-device
   where supported (ASK-UI.md "Voice"). Mic replaces send while the input
   is empty; `src/ai/voice.ts`. Lands with the Build 2 APK.
4. [x] **Health Connect, read only** — [HEALTH.md](decisions/HEALTH.md):
   `HealthPort` + Health Connect adapter, sleep/RHR/HRV/weight/steps,
   readiness on Home and an Ask read tool. Samsung Health via its Health
   Connect sync. Code merged; needs the Build 2 APK to run (native module,
   minSdk 26). Verify on the phone after step 6.
4b. [x] **Share fixes (Build 2):** Download saves to Photos
   (`expo-media-library`, write-only), image + caption + optional app link
   (`react-native-share`, `EXPO_PUBLIC_APP_SHARE_URL`), square export
   (#377, #378).
4c. [x] **Build 2 polish:** resizable widgets (size passed to layouts via
   the expo-widgets patch), monochrome notification + themed icon,
   launcher shortcuts (`plugins/with-app-shortcuts.js`).
5. [x] **G2 attestation** (FOUNDATION-REVIEW.md): Play Integrity token + one-time
   nonce on every managed-AI call (`src/ai/integrity.ts`); the edge grades it
   (`_shared/edge/integrity.ts`, policy in `src/contracts/ai/integrity.ts`) and
   halves the quota for unverified calls, testers exempt, never a hard block.
   Off until the user adds the secrets: enable the Play Integrity API in Cloud
   project 693170623852, create a service account, set
   `PLAY_INTEGRITY_SERVICE_ACCOUNT` + `PLAY_INTEGRITY_CERT_SHA256` (EAS
   signing cert, base64url) as function secrets. iOS App Attest: iOS phase.
5b. [x] **Settings + Profile order:** appearance first (mode inline), then
   basics, rest timer, in-session, linked screens; Profile gains Records,
   Progress photos, Appearance and Settings rows.
5d. [x] **Surface parity:** muscle review moved to `src/contracts/coaching`;
   MCP/Ask `get_training_summary` returns it, web Progress shows it. Rule in
   AGENTS.md. Open: period headline and the full-range volume chart on web.
5e. [x] **Always-latest share link** ([RELEASES.md](decisions/RELEASES.md)):
   `EXPO_PUBLIC_APP_SHARE_URL` → `app-release` function, fed by the EAS build
   webhook. **User:** add repo secrets `EXPO_TOKEN` + `EAS_WEBHOOK_SECRET` so
   `release-mirror.yml` keeps a permanent copy (EAS artifacts expire ~14 days).
5f. [x] **Plateau fixes on every surface** ([PROGRESSION.md](decisions/PROGRESSION.md)):
   app (Progress, fix screen, workout summary, home insight, lift page,
   Settings → Coaching), MCP (review + propose), Ask (review + propose card),
   web (Progress section, Send to app / Not now / Withdraw, Settings).
   Verify on device after the next OTA: Claude proposal → inbox → Apply →
   next session load → Undo.
5g. [x] **What's new:** one pack (`src/contracts/releases/whats-new.ts`):
   app carousel sheet on Home (replaces the Ask sheet; swipe, dots, fixed
   height, Try it / Later, seen per item), web dashboard cards, and each
   build's notes in `app_releases` filled from the pack by the webhook.
   Update-available card done (runtime compare, RELEASES.md "Update available").
5h. [ ] **Abuse layers 6-8** ([ABUSE.md](decisions/ABUSE.md)): new-account
   quota ramp, anomaly alert, cost ledger.
5c. [ ] **Later (user call):** the teal/blue gradient background theme as an
   Appearance preset (presets list in `appearance.tsx`).
6. [x] **Build + install:** EAS preview build on the user's phone (Build 2,
   alpha, Nov 18; runtime f2a3b84), full gym smoke ongoing
   (installed directly, not through Play). User-owned before it: Google
   OAuth clients (2). The Play Console Health Connect declaration is only
   needed before the first upload to a Play track.

7. [x] **Warm-ups saved to the routine** (user, Nov 25; MCP `create_routine` can't set warm-ups yet): a routine row gets a
   warm-up count (`template_exercises.warmup_sets`, local + Supabase + sync
   mapper), starting a workout creates those warm-up rows first (seeded from
   last time's warm-ups), the routine editor edits it, and the finish diff
   treats a warm-up count change like a set-count change (contract:
   `src/contracts/templates/session-changes.ts`; drop sets stay per-day).
   Today warm-ups vanish next time and the working sets sit in their place.
   Parity: MCP `get_routine` + web routine view show warm-ups.
8. [ ] **Fatigue-aware load suggestions** (later): a suggestion from last
   time ignores order and fatigue. Adjust for position in the workout,
   earlier exercises hitting the same muscles, and a lift done after its
   usual slot. One small, explainable factor per cause, tunable in
   `src/contracts/coaching/`, never a black box.
9. [ ] **Home suggestion card repeats** (bug): it can suggest an exercise or
   routine already done that day or last session. Exclude same-day and the
   last session's routine before ranking; month-long arcs come with plans.
10. [ ] **Try agent-driven E2E** (`e2e` by e2e-inc, Apache-2.0): its MCP
   server gives the coding agent an accessibility-tree view of the emulator
   (cheaper than screenshots), and recorded steps replay in CI with no model
   call. Candidate to replace the deferred Maestro plan above; try it on one
   flow (start routine → finish → routine updated) before adopting.

## P0 — Complete & trustworthy (work top-down)

### A. Units and denominators (decisions everything assumes)

Verify in session plus charts. Related: #126.

Decided: canonical kg/cm storage, convert at the edges, optional per-exercise
display unit ([TECH-DECISIONS §15](./decisions/TECH-DECISIONS.md)). Deploy
`supabase/units-canonical.sql` once with the app update.

- [#136](https://github.com/chrisdco/incline/issues/136) unit toggle relabels instead of converting — **addressed** (§15); close after an imperial gym-smoke
- [#144](https://github.com/chrisdco/incline/issues/144) bodyweight chart ignores unit changes — **addressed** (§15); close after a toggle check
- [#165](https://github.com/chrisdco/incline/issues/165) warm-ups inflate displayed volume and counts
- [#190](https://github.com/chrisdco/incline/issues/190) exercise history counts warm-ups as work

### B. Write-path durability

Verify: kill the app mid-anything, no half-states, no lost edits.

Foundation landed: `mutate()` (`src/db/write.ts`, #260) runs each write plus
its outbox enqueues in one transaction and rethrows enqueue failures. Session,
template, exercise and measure writes use it; profile/program/notes/photos
are migrating next. #142 and #197 belong to the session-engine work.

- [#137](https://github.com/chrisdco/incline/issues/137) outbox coalesce non-atomic, crash loses mutations
- [#138](https://github.com/chrisdco/incline/issues/138) background enqueues swallow errors — **addressed** where writes use `mutate()`; close when profile/programs migrate
- [#141](https://github.com/chrisdco/incline/issues/141) finish / discard / remove not transactional — **addressed** (#260); close after a kill-mid-finish smoke
- [#142](https://github.com/chrisdco/incline/issues/142) duplicate open logs + double-tap finish guards
- [#197](https://github.com/chrisdco/incline/issues/197) duration edit can implicitly finish a workout

### C. Sync convergence

Verify with the two-device matrix. Related: #83.

Protocol rewrite landed (batched `sync_push` RPC, server-side LWW, per-table
cursors; see [TECH-DECISIONS §13](./decisions/TECH-DECISIONS.md)). It needs
`supabase/sync-schema.sql` deployed first, then the two-device matrix run on
the new protocol before #139/#140/#201 close.

- [#139](https://github.com/chrisdco/incline/issues/139) push batch head-of-line blocking + poison rows — **addressed** (per-row status, quarantine at 8 attempts, keyset paging past 200); close after the matrix
- [#140](https://github.com/chrisdco/incline/issues/140) shared pull cursor stalls / under-pulls big restores — **addressed** (per-table `(updated_at, id)` cursors, page until exhausted, transactional pages, blocked-row retry set); close after the matrix
- [#143](https://github.com/chrisdco/incline/issues/143) two-device concurrent edits silently lose one side — **partly**: LWW is now atomic server-side with deterministic ties; still whole-row and device clock (decide server timestamps / field merge from the matrix)
- [#199](https://github.com/chrisdco/incline/issues/199) outbox write amplification per keystroke — **addressed** (one transaction per committed field, volume recomputed at finish, #260); close after a session smoke
- [#201](https://github.com/chrisdco/incline/issues/201) wrong-audience JWT retries forever — **addressed** (local aud/role/exp/sub pre-flight, auth errors stop the run and never bump attempts); close after the matrix

### D. Trust and visibility

Verify: stolen-device scenario, prod signal.

- [#145](https://github.com/chrisdco/incline/issues/145) sign-out leaves full DB on disk
- [#146](https://github.com/chrisdco/incline/issues/146) account reset has two paths, different completeness
- [#191](https://github.com/chrisdco/incline/issues/191) error-boundary leaks and loops
- [#154](https://github.com/chrisdco/incline/issues/154) no crash reporting / production monitoring

### E. Session state

Verify: gym loop, no lost edits.

- [#156](https://github.com/chrisdco/incline/issues/156) rest-time edits are memory-only — needs a store design
- [#168](https://github.com/chrisdco/incline/issues/168) rest seeding skips the second session
- [#157](https://github.com/chrisdco/incline/issues/157) new exercises show no assist until remount
- [#164](https://github.com/chrisdco/incline/issues/164) optimistic set toggles can race
- [#167](https://github.com/chrisdco/incline/issues/167) set undo holds only one delete
- [#169](https://github.com/chrisdco/incline/issues/169) replaced exercise can land in wrong slot
- [#170](https://github.com/chrisdco/incline/issues/170) workout-notes draft lost on navigate-away
- [#171](https://github.com/chrisdco/incline/issues/171) pause state is memory-only
- [#172](https://github.com/chrisdco/incline/issues/172) empty workouts can be finished

### F. Dead-ends and states

Verify: no stuck screens, every tap lands somewhere sane.

- [#155](https://github.com/chrisdco/incline/issues/155) failed reports spinner forever, no retry
- [#158](https://github.com/chrisdco/incline/issues/158) nested hero pressable double-navigates
- [#159](https://github.com/chrisdco/incline/issues/159) preview Start button scrolls away
- [#185](https://github.com/chrisdco/incline/issues/185) calendar stats failure shows empty calendar
- [#174](https://github.com/chrisdco/incline/issues/174) exercise detail retry noop for catalog ids
- [#151](https://github.com/chrisdco/incline/issues/151) cold-start notification tap never routes
- [#152](https://github.com/chrisdco/incline/issues/152) rest tap after finish hits a dead session
- [#188](https://github.com/chrisdco/incline/issues/188) weekly digest quotes a stale week (coach-owned, P0-listed)

### P0 — remaining open (ungrouped, still P0-owned)

Forms/editors, measures, tools, photo quota, template identity, infra,
a11y/sweeps:

[#247](https://github.com/chrisdco/incline/issues/247) (Expo SDK 58 upgrade — **landed in #249**; Android widgets + `alarmClock` rest delivery adopted from it; device/release smoke still owed),
[#160](https://github.com/chrisdco/incline/issues/160),
[#161](https://github.com/chrisdco/incline/issues/161),
[#162](https://github.com/chrisdco/incline/issues/162),
[#163](https://github.com/chrisdco/incline/issues/163),
[#150](https://github.com/chrisdco/incline/issues/150),
[#176](https://github.com/chrisdco/incline/issues/176),
[#179](https://github.com/chrisdco/incline/issues/179),
[#182](https://github.com/chrisdco/incline/issues/182),
[#183](https://github.com/chrisdco/incline/issues/183),
[#184](https://github.com/chrisdco/incline/issues/184),
[#186](https://github.com/chrisdco/incline/issues/186),
[#193](https://github.com/chrisdco/incline/issues/193),
[#195](https://github.com/chrisdco/incline/issues/195),
[#196](https://github.com/chrisdco/incline/issues/196),
[#203](https://github.com/chrisdco/incline/issues/203),
[#204](https://github.com/chrisdco/incline/issues/204),
[#207](https://github.com/chrisdco/incline/issues/207),
[#208](https://github.com/chrisdco/incline/issues/208).

## P1 — Habit loops

- [#122](https://github.com/chrisdco/incline/issues/122) account prefs sync (verify-to-close, see top)
- [#24](https://github.com/chrisdco/incline/issues/24) workout duration target per template
- [#71](https://github.com/chrisdco/incline/issues/71) high-ROI clean additions backlog (ranked)
- [#94](https://github.com/chrisdco/incline/issues/94) body measurement goals — keep open; build only with regular Measures use
- [#175](https://github.com/chrisdco/incline/issues/175) onboarding goal required
- [#177](https://github.com/chrisdco/incline/issues/177) bodyweight dead-ends + silent load failure
- [#178](https://github.com/chrisdco/incline/issues/178) muscle filter omits five groups
- [#180](https://github.com/chrisdco/incline/issues/180) photo compare empty state has no next step
- [#187](https://github.com/chrisdco/incline/issues/187) 1RM calculator needs too many taps
- [#205](https://github.com/chrisdco/incline/issues/205) charts + toasts a11y batch
- [#215](https://github.com/chrisdco/incline/issues/215) tokenized search with typo tolerance + recency

## AI track ([AI-ARCHITECTURE.md](decisions/AI-ARCHITECTURE.md), platform: [AI-PLATFORM.md](decisions/AI-PLATFORM.md))

AI proposes, rules verify, the user applies. Work the steps in order; each
step's issue is opened when it starts. Evals live in [evals/](../evals/README.md).

- [x] **0. Write-up + evals:** decision doc, [resources](ai/RESOURCES.md), the
  narrate eval (runnable), and the voice and template fixtures.
- [ ] **1. Foundations + AI UI kit:**
  - `src/ai/`: adapters, router, tasks, guardrails, proposals/undo.
  - `src/components/ai/*`.
  - [x] `ai_feedback` and `ai_activity`, the UI kit, AI settings (#307–#310).
  - [x] Platform prep (AI-PLATFORM §10): `src/contracts/` boundary + Deno
    sync (#312), action registry, `ai_activity.actor` / `device_id`, remote
    kill switches (`ai_flags`).
  - [x] `ai-task` edge function (deployed; `supabase/ai-task.sql` applied):
    task table, per-user cache + quota, kill switch, Groq primary with an
    optional fallback upstream. Cloudflare AI Gateway = set `AI_BASE_URL`.
  - [x] `ai-task` secrets set (`CLERK_FRONTEND_API`, `GROQ_API_KEY`, 2026-11-04).
  - Picks up #148 and #189.
- [x] **2. Templates AI:** `TemplateDiff` to create, modify, duplicate, or
  build a template from a workout; editor chips (#330–#333).
  - [x] MCP v1 (#242): `incline-mcp` live, 10 tools, personal tokens from
    Settings → AI → Connect AI apps. OAuth and `propose_*` tools come later.
- [ ] **3. Plans + challenges:**
  - [x] AI plan builder (#335): Workouts → "Build a plan with AI". Length
    presets (1–12 wk), days, goal, level, time, equipment + free text
    ("Winter Arc"). Code owns the skeleton (docs/decisions/PROGRAMMING.md);
    the model picks exercises; saved as routines + program, one undo.
    `plan_build` task, 10/day.
  - [x] Eval set for plan drafts (#339, `evals/plans`, Groq 91%).
  - [x] Check-ins / streaks for the active plan (#340): week dots, streak,
    best, "Run it again".
  - [x] Change a plan by asking: `plan_edit` task, ops move/remove/add day,
    weeks, swap exercise, rename; preview + one undo. `evals/plan-edit`.
  - [ ] Device test of the builder, check-ins and plan edits.
  - [ ] Community/marketplace plans (later).
- [ ] **4. Smart surfaces + personalisation:**
  - [ ] **Ask chat** — design in [AI-CHAT.md](decisions/AI-CHAT.md): device-side
    agent loop (own OpenAI-compatible adapter), `ai-chat` streaming proxy,
    local threads, memory facts.
    - [x] Phase 0.5 contracts + runtime (#355), `ai-chat` gateway + model
      catalog G8 (#356), the 9 read tools on SQLite shared with incline-mcp (#357).
    - [x] Phase 1 core: threads (`023_chat`), Ask composer + recent chats,
      thread screen with streaming, tool activity line, source chips, stop;
      each turn recorded in AI data use.
    - [ ] Phase 1 device test against the live gateway (signed in, real key).
    - [ ] Phase 2 data cards → 3 memory → 4 in-session sheet.
  - [ ] **Foundation review** — [FOUNDATION-REVIEW.md](decisions/FOUNDATION-REVIEW.md):
    [x] G1 consent (#353), [x] G9 data use (#354), [x] G8 catalog (#356).
    G2 attestation with the next native build; G3/G7 before Health Connect;
    G5/G6/G11 with nutrition; G10 with MCP OAuth.
  - Context chips, the Ask sheet, and voice logging (gym loop: Hevy/Strong
    side-by-side check before PR).
  - `coach_memory` learning, the "What Incline knows about you" screen, and
    the activity log.
- [ ] **5. Health Connect:** read activity, sleep, HRV, weight and nutrition;
  write workouts; readiness rule (#7).
- [ ] **6. Nutrition logging:** grounded in Open Food Facts and USDA;
  two-way sync with Samsung Health through Health Connect.
- [ ] **7. On-device:** SDK 59 + `expo-ai` adapter.

## P2 — Coaching & intelligence

- [#126](https://github.com/chrisdco/incline/issues/126) reconcile stored `total_volume` vs working-set volume — one written rule, no silent history rewrite (Track B)
- [#27](https://github.com/chrisdco/incline/issues/27) AI workout suggestion from history
- [#40](https://github.com/chrisdco/incline/issues/40) coaching insights engine
- [#73](https://github.com/chrisdco/incline/issues/73) advanced analytics (deferred, scope TBD)
- [#148](https://github.com/chrisdco/incline/issues/148) narrate auth falls back to audience-less verify
- [#153](https://github.com/chrisdco/incline/issues/153) custom exercise names reach the LLM unsanitized
- [#189](https://github.com/chrisdco/incline/issues/189) client and edge number-gates drifted
- [#192](https://github.com/chrisdco/incline/issues/192) program-day math breaks on DST
- [#194](https://github.com/chrisdco/incline/issues/194) home PR count is all-time, misleads narration
- [#202](https://github.com/chrisdco/incline/issues/202) summary narration effect thrashes
- [#206](https://github.com/chrisdco/incline/issues/206) cache, milestones + month fallback batch
- [#239](https://github.com/chrisdco/incline/issues/239) satellite: incline-insights (plateau, strength trends)
- [#240](https://github.com/chrisdco/incline/issues/240) satellite: incline-coach rules pack
- [#243](https://github.com/chrisdco/incline/issues/243) ecosystem: multi-vendor training contexts

## P3 — Social & platform growth (after P0 proven)

- [#78](https://github.com/chrisdco/incline/issues/78) public workouts / friends / shared sessions
- [#125](https://github.com/chrisdco/incline/issues/125) signed URLs for shared/public views (after #78)
- [#109](https://github.com/chrisdco/incline/issues/109) session photo upload for backup (private first)
- [#123](https://github.com/chrisdco/incline/issues/123) / [#124](https://github.com/chrisdco/incline/issues/124) photo bucket + durable queue
- [#7](https://github.com/chrisdco/incline/issues/7) Apple Health / Google Fit sync
- [#25](https://github.com/chrisdco/incline/issues/25) smart rest timer (HealthKit — needs P3 platform)
- [#30](https://github.com/chrisdco/incline/issues/30) template marketplace
- [#181](https://github.com/chrisdco/incline/issues/181) share cards export one slide silently
- [#244](https://github.com/chrisdco/incline/issues/244) ecosystem: importer coverage parity

## P4 — Target architecture (document patterns, don't build)

- [#83](https://github.com/chrisdco/incline/issues/83) sync/platform evolution (GC, conflicts, API boundary)
- [#112](https://github.com/chrisdco/incline/issues/112) native Google account picker
- [#198](https://github.com/chrisdco/incline/issues/198) UUID backfill scans every launch
- [#216](https://github.com/chrisdco/incline/issues/216) pnpm workspaces migration
- [#241](https://github.com/chrisdco/incline/issues/241) satellite: export bridges
- [#242](https://github.com/chrisdco/incline/issues/242) satellite: incline-mcp + CLI

## Week-2 track choice (pick exactly one when P0 prove passes)

- **Track A — Session alerts** (recommended if gym use is daily): rest
  remaining on lock (needs native build), one abandoned-session ping
  (~20–30 min, tap → session), rest-tap deep-links to the live session.
  Out of scope: log-set from notification, extra nags. Home-screen widgets
  and `alarmClock` rest delivery already shipped; Track A builds on that.
  SDK 58 supplies the native path for `rest-lock` (Android ongoing
  notification via `expo-widgets` `createCustomNotification`, iOS Live
  Activity + `delivery: 'alarmClock'`) — see
  [#247](https://github.com/chrisdco/incline/issues/247) before designing it.
  **Rest on lock/shade: built (Android, needs device check).** Ongoing
  `RestTimer` custom notification (`src/widgets/rest-notification.tsx`,
  `src/lib/rest-ongoing/`): native header chronometer via the expo-widgets
  patch, "Until …" + "Next: Set 3 · 80 kg × 8", Skip / +30s mirrored into
  `rest-timer-store`. With the app dead, presses update only the
  notification; the rest-complete alarm is not moved. iOS → #282.
- **Track B — Analytics honesty** ([#126](https://github.com/chrisdco/incline/issues/126)):
  stored vs working volume, one definition across Progress / recap / ghost.
- **Track C — AI narrations live**: only with a real key deployed; prove
  Edge Function + stub safety, wording never invents loads.

GitHub hygiene: Track A → open 2 issues (lock/shade rest, abandoned
ping); Track B → work #126; Track C → comment on #99. Close children
#119–#124 when the matrix row passes, not on merge.

## Deferred / needs-decision (do not pile up again — each needs a decision + issue before work)

- #136 convert-vs-freeze for unit conversion
- #156 rest-persistence store design
- Picker unification for edit-workout
- Webhooks for out-of-band Clerk deletes
- Streak grace definition
- History pagination rework
- Sentry sourcemaps (needs tokens)
- Playwright `data-testid`s + build-start CI
- Web a11y batch (44pt, labels, table scroll)
- Seed-template names; dupe-tolerant custom matching
- Tx-read interleaving note (Batch C)
- Reduced-motion gating
- GestureDetector press refactor (+ ground-truth shared values)
- Home feed FlatList→FlashList (+ HistoryRow memo, getItemType)
- NativeTabs migration; measureLayout→onLayout cache;
  SafeAreaView→contentInset; fonts config plugin (needs rebuild)
- Monorepo React version split (accepted: pinned per runtime)
- Session-set virtualization; useTransition refactors (manual busy states are fine)
- Serialization micro-cuts

Rule going forward: a deferred item re-enters only via a tracked issue
linked from its milestone — never as an untracked bullet in a new doc.

## Resolved — no action (kept so they are never re-litigated)

- **A6** volume tap flips units — kept deliberately (visible toast,
  display-only). Ruled irrelevant 2026-09-29.
- **A1** no steppers — decided: no steppers (Hevy/Strong don't; clutter);
  tap-prev-to-copy everywhere instead. Live session wired; edit-workout
  NOT wired (`edit-workout/[id].tsx`).
- **A7** Add Exercise only at top — decided: mirror CTA at bottom of
  scroll (sticky bar would collide with RestTimer/undo pill). Shipped via
  set-row ergonomics.
- **B2** new routine drops duration — verified in code; fixed via
  routine-duration branch (persist on create/duplicate/from-log).
- **C1** warm-ups inflate volume — verified root cause; owned by #165 /
  #126 (working-only everywhere).
- **D4** account-switch reset incomplete — fixed via sync-loss-guards
  (device vs account prefs partition).
- **#158** done. **#224** (this tracker's meta-issue): close when this
  queue merges — milestones + this file replace it.
- Second-pass 2026-09-25 fixes (web purge, storage purge, pagination,
  unit normalization, aggregates, import guards, outbox dedup, write
  queue, deletion states, edge parity, etc.) — all landed; see
  `archive/` for the original lists.
