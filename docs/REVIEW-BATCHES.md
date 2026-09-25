# Review batches — pickup list (Sep 2026 full-app review)

Solo-dev rule: no parent issues, no board. The 73 filed issues (#136–#208)
are the interactive layer; this file is the only grouping. Batches are
PR-sized: same files, one verification story each. Pick top-down.

Graduate to sub-issues or a project board only when collaborators arrive.

## Deferred verification (Tier 3, later)

Maestro E2E on an emulator in CI (user flows plus kill-and-resume) is
deferred. Unit tests stay local-fast (`npm test`); integration tests
(`*.integration.test.ts`) run via `npm run test:integration` in CI only.
Hardware behaviors (haptics, notifications, camera) stay manual gym-smoke.

## A. Units and denominators (decisions everything assumes)

#136 unit toggle converts, #144 bodyweight unit normalization, #165 working-set
volume rule, #190 history warm-up filter. Verify in session plus charts.
Related: #126.

## B. Write-path durability (picked up Sep 2026)

#137 outbox atomicity, #138 await enqueues, #141 finish/discard/remove
transactions, #142 duplicate open logs plus double-tap guards, #197 duration
edit guard. Verify: kill the app mid-anything, no half-states, no lost edits.

## C. Sync convergence

#139 push batching/DLQ/backoff, #140 per-table cursors plus pagination,
#143 LWW documentation and timestamps, #199 write amplification, #201 JWT
audience validation. Verify with the two-device matrix. Related: #83.

## D. Trust and visibility

#145 sign-out wipe, #146 single transactional reset, #191 error-boundary
hardening, #154 crash reporting. Verify: stolen-device scenario, prod signal.

## E. Session state

#156 and #168 rest persistence plus seeding, #157 assist on focus, #164
optimistic guards, #167 undo stack, #169 replace slot, #170 notes autosave,
#171 pause persistence, #172 empty finish. Verify: gym loop, no lost edits.

## F. Dead-ends and states

#155 report spinners, #158 nested hero press, #159 preview CTA, #185 calendar
stats error, #174 exercise retry, #151 and #152 notification routing, #188
digest body. Verify: no stuck screens, every tap lands somewhere sane.

## G. Coaching correctness

#148 edge auth fallback, #153 exercise-name sanitization, #189 gate parity,
#194 home PR count, #202 narration deps, #192 DST math. Verify: narrations
stay honest. Related: #99.

## H. Data model and scale

#195 and #196 seed deletes and identity, #198 uuid backfill cost, #200 N+1
queries, #149 PR snapshot bounds, #147 and #193 photo durability and quota.
Verify: cold start plus large-history perf. Related: #123, #124, #109.

## I. Forms and editors

#160 duration target, #184 program name guard, #186 keyboard avoidance,
#175 onboarding goal required, #176 auth input polish, #161 edit-workout
cancel honesty, #162 clear-history export nudge, #163 DB-failure UI.

## J. Discoverability and lows

#177 bodyweight CTAs, #178 full muscle filter, #179 honest range labels,
#180 photos empty CTA, #182 aurora dots, #183 plate prefill, #187 calculator
entry, #181 share slide labeling, #203-#208 low batches. Related: #78.

## Second pass (audit 2026-09-25 — fixed same day unless noted)

Fixed, no issue needed: web purge unblocked from Clerk middleware; recursive
storage purge; workouts pagination single-+1; unit normalization on web
aggregates; reports two-query aggregate; measurements default metric;
deleted_at filters on custom-exercise reads; profile whitelist + updated_at;
CSV header id; export token guard + counts; import dedup key + per-workout
isolation; shared all-time scan; weekStart canonical; settings pending state;
import 25 MB guard. Mobile: outbox upgrade dedup; addSet/WarmUp sort slots;
edit-workout restoreSet + catches; deletion three-state status; profile
finally-signout; replace dense renormalization; focus assist for new
exercises; edge recentWeeks parity (+ weeklyStreak typo); reorder catch +
up/down buttons; keyed start mutex + write queue; recents filter; report
error states; muscle map completed-only; nested hero press; adapter exec
faults; note-save warns; HANDOFF refresh.

Deferred (pick next): #136 unit conversion (needs convert-vs-freeze
decision); #158 done; rest persistence (#156 — needs a store design);
picker unification for edit-workout; webhooks for out-of-band Clerk deletes;
streak grace definition; history pagination rework; Sentry sourcemaps (needs
tokens); Playwright data-testids + build-start CI; web a11y batch (44pt,
labels, table scroll); seed-template names; dupe-tolerant custom matching;
tx-read interleaving note (Batch C); reduced-motion gating.

## Skills pass (2026-09-25 — applied unless noted)

Skills installed project-wide: `.agents/skills/vercel-react-best-practices`,
`web-design-guidelines`, `vercel-react-native-skills` (+ pointer in
`web/README.md`). Next.js workflow skills skipped (assume Cache
Components/PPR; this app is fully dynamic).

Applied, web: parallelized queries (getWorkout/Routine/Program/resolve/
records chunks/custom inserts), dashboard-then-streaming page shape,
per-section Suspense (dashboard, progress), dynamic recharts + lazy
papaparse, `optimizePackageImports: lucide-react`, content-visibility rows,
labeled search/focus rings/aria-current/roles/captions, skip link +
theme-color + color-scheme + touch-action, loading role + reduced-motion,
44px toggle, aria-hidden icons, sr-only file input, aria-live statuses,
nbsp units, transition-colors + motion-reduce, table scroll wrappers.

Applied, mobile: plate-calculator ternary (falsy-&& crash class), expo-image
avatar, GPU scaleX fills (rest-timer, ui/progress), segmented translateX +
instant width, boxShadow string, margin→padding/gap, sheet Title variant,
memoized picker rows + stable by-id callbacks + hoisted separator.

Deferred: GestureDetector press refactor (+ ground-truth shared values);
home feed FlatList→FlashList (+ HistoryRow memo, getItemType); NativeTabs
migration; measureLayout→onLayout cache; SafeAreaView→contentInset;
fonts config plugin (needs rebuild); monorepo React version split (accepted:
pinned per runtime); session-set virtualization; useTransition refactors
(manual busy states are fine); SWR (no shared polling to dedupe);
serialization micro-cuts.
