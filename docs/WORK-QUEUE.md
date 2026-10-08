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
- Session logging must never await network / AI / upload.
- Prefer a focused PR. Do not mix docs-only with behavior changes.

Safe anytime (lean / docs / copy):

| Slice | Why | Stay inside |
|----|-----|-------------|
| `rest-deeplink` | Rest-complete tap opens the live session if one exists, else Home | `src/lib/notifications/routes.ts`, `deep-link.ts`, tests |
| `reminder-copy` | Workout reminder body is generic; keep it short, no extra nags | `src/lib/notifications/reminders.ts` + tests |
| `ghost-warmups` | Extra test that warm-up sets cannot beat “Last time” volume | `src/lib/session-ghost.ts` + existing tests |
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

Explicitly not slices: Home-screen widgets, #94 measurement goals, #112
Google sheet, #78 / #125 signed public photos, #83, chat coach, program
generation, logging a set from a notification.

## Verify-to-close (merged code, proof still owed)

Do not close these on merge alone. Proof is the two-device matrix
(Device A logs → sync → Device B fresh install, same Clerk user pulls)
or the stated smoke.

Deploy first (both still required):

- Re-run full `supabase/sync-schema.sql` (idempotent).
- Confirm tables: `body_measurements`, `user_programs`,
  `user_program_workouts`, `user_active_program`, `user_preferences`,
  `workout_photos` (+ private Storage bucket `workout-photos`).
- Confirm live `set_entries` has `set_type` / `rpe` / `superset_group`.
- Deploy `supabase/coach-narrate.sql` + Edge Function + `OPENAI_API_KEY`
  (or `COACH_NARRATE_STUB=1`); `aiExplanationsEnabled` stays default off.

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

## P0 — Complete & trustworthy (work top-down)

### A. Units and denominators (decisions everything assumes)

Verify in session plus charts. Related: #126.

- [#136](https://github.com/chrisdco/incline/issues/136) unit toggle relabels instead of converting — needs convert-vs-freeze decision first
- [#144](https://github.com/chrisdco/incline/issues/144) bodyweight chart ignores unit changes
- [#165](https://github.com/chrisdco/incline/issues/165) warm-ups inflate displayed volume and counts
- [#190](https://github.com/chrisdco/incline/issues/190) exercise history counts warm-ups as work

### B. Write-path durability

Verify: kill the app mid-anything, no half-states, no lost edits.

- [#137](https://github.com/chrisdco/incline/issues/137) outbox coalesce non-atomic, crash loses mutations
- [#138](https://github.com/chrisdco/incline/issues/138) background enqueues swallow errors
- [#141](https://github.com/chrisdco/incline/issues/141) finish / discard / remove not transactional
- [#142](https://github.com/chrisdco/incline/issues/142) duplicate open logs + double-tap finish guards
- [#197](https://github.com/chrisdco/incline/issues/197) duration edit can implicitly finish a workout

### C. Sync convergence

Verify with the two-device matrix. Related: #83.

- [#139](https://github.com/chrisdco/incline/issues/139) push batch head-of-line blocking + poison rows
- [#140](https://github.com/chrisdco/incline/issues/140) shared pull cursor stalls / under-pulls big restores
- [#143](https://github.com/chrisdco/incline/issues/143) two-device concurrent edits silently lose one side
- [#199](https://github.com/chrisdco/incline/issues/199) outbox write amplification per keystroke
- [#201](https://github.com/chrisdco/incline/issues/201) wrong-audience JWT retries forever

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
  Out of scope: log-set from notification, extra nags, widgets.
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
- SWR (no shared polling to dedupe); serialization micro-cuts

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
