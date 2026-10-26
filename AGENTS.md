# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

**Project context:** See [docs/HANDOFF.md](docs/HANDOFF.md) (current state — refresh via `node scripts/refresh-handoff.mjs`) and [docs/WORK-QUEUE.md](docs/WORK-QUEUE.md) (the only pickup list). Standing decisions live in `docs/decisions/`; shipped history in `docs/archive/` (read-only).

## Data-loading rules (non-negotiable)

- **Never query per row in a loop.** Batch with `WHERE id IN (...)` + assemble maps (see `mapExerciseRows`). One list screen once cost 1200+ queries; don't regress it.
- **Pickers render cached, revalidate behind.** TanStack Query (`src/lib/query-keys.ts`): keys start with the tables read; writes go through `mutate()` (`src/db/write.ts`) and the table-change event invalidates — never call refetch on focus, never a timer. See TECH-DECISIONS §11.
- **SQLite is source of truth; memory is disposable.** Never write through a cache. Writes + their outbox enqueues go in one `mutate()` transaction. Worst acceptable failure is one stale open.
- **Lists render virtualized** (FlashList), rows stay presentational, no per-row async work.
- **List projections stay light.** Browse/search rows need name/muscle/equipment only — don't drag instructions/images into list queries (next escalation when catalog passes low thousands).
- **No new SWR hand-rolls** — reads are TanStack Query (adopted, #228). Zustand stays for UI/session state only.

## UI changes (screenshots beat memory)

- **Gym-loop surfaces (session rows, cards, pickers) need a side-by-side check** against the Hevy/Strong reference screenshots before PR. Misses so far: prev treatment (text, never a box), tick placement, press feedback — all caught by the user, none by code review.
- **Reference anatomy lives in code comments** (see `set-row.tsx` header). Update the comment when the reference changes; don't restyle from memory.
