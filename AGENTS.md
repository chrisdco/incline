# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

**Project context:** See [docs/HANDOFF.md](docs/HANDOFF.md) (current state — refresh via `node scripts/refresh-handoff.mjs`) and [docs/WORK-QUEUE.md](docs/WORK-QUEUE.md) (the only pickup list). Standing decisions live in `docs/decisions/`; shipped history in `docs/archive/` (read-only).

## Data-loading rules (non-negotiable)

- **Never query per row in a loop.** Batch with `WHERE id IN (...)` + assemble maps (see `mapExerciseRows`). One list screen once cost 1200+ queries; don't regress it.
- **Pickers render cached, revalidate behind.** TanStack Query (`src/lib/query-keys.ts`): keys start with the tables read; writes go through `mutate()` (`src/db/write.ts`) and the table-change event invalidates — never call refetch on focus, never a timer. See TECH-DECISIONS §11.
- **SQLite is source of truth; memory is disposable.** Never write through a cache. Writes + their outbox enqueues go in one `mutate()` transaction. Worst acceptable failure is one stale open.
- **Lists render virtualized** (FlashList), rows stay presentational, no per-row async work.
- **List projections stay light.** Browse/search rows need name/muscle/equipment only — don't drag instructions/images into list queries (next escalation when catalog passes low thousands).
- **No new SWR hand-rolls** — reads are TanStack Query (adopted, #228). Zustand stays for UI/session state only.

## Surface parity (app, MCP, web, Ask)

- **Every data feature or insight lands on all surfaces, or the PR says why not.** The app, the MCP server (`supabase/functions/incline-mcp`), the web app (`web/`) and in-app Ask read the same data; they must say the same thing about it.
- **Shared logic lives in `src/contracts/`** (pure TS, synced to Deno by `scripts/sync-contracts.mjs`; web imports it by relative path, see `web/src/lib/muscle-review.ts`). Put rules, thresholds and output shapes there, never inside a screen.
- **MCP/Ask tool output comes from `src/contracts/mcp/shape.ts`**, so a new insight added there reaches Claude (MCP) and Ask at once.
- **PR checklist line:** app / MCP / web / Ask: done, or a named follow-up in docs/WORK-QUEUE.md.

## UI changes (screenshots beat memory)

- **Tokens and layout primitives first:** [docs/design/SYSTEM.md](docs/design/SYSTEM.md) (type scale, spacing, radius, `Section` / `ListRow` / `StatBlock`). Lint rejects arbitrary style values.

- **Gym-loop surfaces (session rows, cards, pickers) need a side-by-side check** against the Hevy/Strong reference screenshots before PR. Misses so far: prev treatment (text, never a box), tick placement, press feedback — all caught by the user, none by code review.
- **Reference anatomy lives in code comments** (see `set-row.tsx` header). Update the comment when the reference changes; don't restyle from memory.

## Finish like a user would (completeness)

- **Walk the whole flow as the user, not just the changed screen.** Before PR, run the feature end to end:
  - back and swipe-back after it, so leftover screens don't come back;
  - leaving mid-way and reopening;
  - offline, and an empty account;
  - every edge the feature touches (a dismissed drawer, a stale stack, an unsaved edit).
- **No silent loss.** Every user change is saved or explicitly asked about. A change that's dropped without a word is a bug, however small.
- **Nitpicks are bugs.** A leftover pixel strip, a missing gesture or a stale screen erodes trust like a crash. Fix them in the same PR when you find them, or log them in docs/WORK-QUEUE.md.
