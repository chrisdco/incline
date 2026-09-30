# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

**Project context:** See [docs/HANDOFF.md](docs/HANDOFF.md) (current state), [docs/SPRINT-2026-08.md](docs/SPRINT-2026-08.md) (two-week plan + one-slice agent tasks), and [docs/P1-P2-COACHING.md](docs/P1-P2-COACHING.md) (coaching work).

## Data-loading rules (non-negotiable)

- **Never query per row in a loop.** Batch with `WHERE id IN (...)` + assemble maps (see `mapExerciseRows`). One list screen once cost 1200+ queries; don't regress it.
- **Pickers render cached, revalidate behind.** `exercise-cache.ts` / `session-cache.ts` pattern: sync render from memory + background refresh. Invalidate at the write site (create/delete/import/wipe), never on a timer.
- **SQLite is source of truth; memory is disposable.** Never write through a cache. Worst acceptable failure is one stale open.
- **Lists render virtualized** (FlashList), rows stay presentational, no per-row async work.
- **List projections stay light.** Browse/search rows need name/muscle/equipment only — don't drag instructions/images into list queries (next escalation when catalog passes low thousands).
- **No new SWR hand-rolls past five caches** — at that point adopt TanStack Query instead (see issue #228). Until then, zustand + tiny caches.

## UI changes (screenshots beat memory)

- **Gym-loop surfaces (session rows, cards, pickers) need a side-by-side check** against the Hevy/Strong reference screenshots before PR. Misses so far: prev treatment (text, never a box), tick placement, press feedback — all caught by the user, none by code review.
- **Reference anatomy lives in code comments** (see `set-row.tsx` header). Update the comment when the reference changes; don't restyle from memory.
