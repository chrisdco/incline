# Workout changes and the routine

Decided Nov 2026.

**Problem:** a workout started from a routine can drift from it: added or deleted sets, added, removed, swapped or reordered exercises, rest changes. Before this change, rest edits were dropped at finish and structure changes stayed in that one log. Nothing told the user.

## Rules

The rules live in `src/contracts/templates/session-changes.ts` (shared with edge and web).

| Change | What happens at finish |
|---|---|
| Rest time only | The routine updates without asking. The "Workout saved" toast says so and has **Undo**. |
| Sets added or deleted, exercises added, removed, swapped or reordered | The finish dialog lists the changes and asks: **Update routine** / **Save as new routine** / **Keep routine as is**. |
| Exercise skipped for today | Never a change: it stays in the routine at its targets. |
| Set left open (not done) | Never a change. Open sets are dropped from the log at finish, as before. |
| Warm-up or drop sets | Never a change: they're per-day extras. |

- **Past workouts never change.** Each log keeps its own set rows. A routine edit only shapes the next start.
- **Save as new routine** creates a copy named "Routine · 19 Nov". The finished workout is linked to the copy, so the copy's next run compares against it.
- **Workouts started empty** have no routine and no prompt. The summary's "Save as routine" covers them.

## Version history

- **Every write from a workout saves the routine's previous state first:** update, silent rest update, Undo and restore. These are kept in `template_versions`, at most 20 per routine.
- **Restoring:** the routine screen's "Version history" sheet lists them. Restoring saves the current state as a version first, so a restore can be undone.

## Skip for today

- **Effect:** an exercise's menu → **Skip today** shrinks the card to its header, with **Restore**.
- **Storage:** the skip lives in the session's volatile kv state, like rest and pause, so a kill or relaunch keeps it.
- **At finish:** its open sets drop with every other open set, so the history shows only what was done.
- **Doing something else instead:** add it with **Add exercise**. That counts as an added exercise; the finish prompt's **Keep routine as is** leaves the routine alone.
- **Replace exercise** stays as it was. A swap may be permanent or one-off, and the user decides at finish.

## Limits (named, not built)

- **`template_versions` is local-only.** It doesn't sync, so a second device, the web and MCP can't see old versions. They do see the updated routine, which syncs as usual. Follow-up in WORK-QUEUE.
- **Skips aren't recorded in history.** Ask and MCP can't say "skipped Bench today". If that's wanted, it needs a synced per-log field.
- **Same exercise twice in one routine:** the diff matches by exercise, so the second copy is compared as the first. Rare enough to leave.
