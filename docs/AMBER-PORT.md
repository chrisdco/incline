# Amber port — what we took, what's deferred

Source: `chrisdco/amber` (straight fork of `SchroederNathan/amber`, synced 2026-09-23).
Full analysis: previous session. Rule: port only what fits offline-first
SQLite + outbox; never port Convex-as-truth, MMKV persisted feeds, or anything
that makes session logging await network/AI.

## Ported

| Item | Where it landed |
|------|-----------------|
| NavTheme bridge + SystemUI flash fix | `src/app/_layout.tsx` |
| Motion tokens | `src/styles/motion.ts` |
| Button polish (loading, retention, a11y) | `src/components/ui/button.tsx` |
| Narrate soft sanitizer (client) | `src/coaching/narrate-validate.ts` (+ tests) |
| Narrate soft sanitizer (edge mirror) | `supabase/functions/coach-narrate/schema.ts` |
| Account-switch narration wipe | `src/app/index.tsx` |
| Share sheets formSheet convention | `src/app/_layout.tsx` |

## Deferred (deliberate — do not port opportunistically)

| Item | Why later | Reference |
|------|-----------|-----------|
| `+native-intent` share rewrite | Needs public/shareable sessions first | #78, then #125 |
| Native Tabs (`unstable-native-tabs`) | Native rebuild; custom tab bar + session bar depend on JS tabs | Week 2 Track A |
| TanStack Query client layer | SQLite is source of truth by design | Architecture constraint |
| EAS `APP_VARIANT` + fingerprint/OTA workflow | Build infra; after Week 1 prove | Sprint 1.2–1.3 |
| `Stack.Protected` onboarding guards | Root gate (`src/app/index.tsx`) owns auth→onboarding→app + pre-route sync; migration is a routing rewrite | New issue if wanted |
| Narrate `processing → ready` status-flag pipeline | Needs schema migration (v18) + trigger; session finish must never await it | #99 follow-up |
| Suggested-only AI writes invariant | No auto-suggestion table exists yet; apply when one lands | #99 / coaching |
| App-lock (biometric + privacy screen) | New feature, not requested; needs physical-device matrix | New issue if wanted |
| Local native-module template | No new native module needed | Track A if live-activity lands |
| Tidy swipe-deck / pager rewrite | Photo compare + progress lists work; rewrite is risk without payoff | #23 follow-up if jank proven |
| Swap picker prefetch/cache | Open-first (no await) landed; revisit only with traces | Session perf |

Convention: each deferred row names the issue or milestone that unlocks it.
Promote a row by filing/linking the issue first — not by expanding a PR.
