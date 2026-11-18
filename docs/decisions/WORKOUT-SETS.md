# Workout sets: dirty reps and drop sets

Status: adopted (2026-11-18). Applies to app, MCP, web and Ask.

## Dirty reps

A set can be marked **dirty reps**: you finished it, but form broke or you
forced the last reps.

- **Stored:** `set_entries.rep_quality` is `'dirty'` or NULL (clean). The
  contract is `src/contracts/coaching/rep-quality.ts`.
- **Coaching:** a dirty set counts as max effort (`effectiveRpe` gives 10).
  - The next suggestion holds the weight: "Last set was a grind (dirty reps)".
  - Plateau detection uses the same effective RPE on every surface.
  - A lighter set after a dirty set is the right call, so the in-session
    "Load dropped" cue stays quiet.
- **Records:** the lift still counts. Weight and reps are what happened, and
  the marker only explains them.
- **How to mark it:**
  - the "Dirty reps" chip under the set you just finished;
  - the toggle in the set menu (tap the set number);
  - a long-press on the tick, which completes the set and marks it in one go.
- **How it shows:**
  - app: "dirty" under the set number, in warning colour, in place of "@RPE";
  - web: "dirty" next to the RPE;
  - MCP `get_workout`: `dirty: true` on the set.

## Drop sets

A drop set is a separate set straight after its parent: lighter weight, done
to failure, with no rest in between. It is not a sub-row inside the parent
set.

- **Stored:** the existing `set_type = 'drop'` at parent `set_index + 1`,
  with the later sets shifted down. A parent can have a chain of drops.
- **Adding one:** "+ Drop" under the last completed set, or "Add drop set
  after this" in the set menu.
  - Weight is pre-filled about 20% lighter, rounded to plates and always at
    least one step lighter (`dropSetLoad`). Reps copy the parent's reps.
- **How it shows:**
  - "D" in place of the set number, with a thin info-coloured bar on the left;
  - set numbering skips drops;
  - the columns never move.
- **Rest:** the timer doesn't start while the next set is an unfinished drop.
- **Coaching:** drops are not working sets. They are excluded from overload,
  plateau and fatigue rules, but count toward volume like any completed set.

## Times (start, finish, duration)

Editing a finished workout's times works like a calendar event: the field
you didn't touch stays put (`src/contracts/workout-time.ts`).

| You change | Stays | Moves |
|---|---|---|
| Date | times, duration | the whole workout |
| Started | finish | duration (by the same amount) |
| Finished | start | duration |
| Duration | start | finish |

- Duration is **active time**. A paused session has finish − start > duration;
  edits shift duration by the same delta so the paused gap survives, and the
  Duration row says "N min paused not counted".
- Rejected without writing: start at/after finish, finish in the future, under
  one minute. A finish time picked earlier than the start rolls to the next day
  only for a plausible overnight session (< 8 h).
- Open sessions only move their start (the live clock's origin).
- Why: before this, changing the start left the stored finish and duration
  untouched, so the three disagreed (and could go negative); the user expected
  start edits to change the duration.

## Dumbbell weight (each or total)

Most lifters, and Hevy and Strong, log one dumbbell; some log the pair. Both
are fine if consistent, so it's a choice (`src/contracts/coaching/dumbbell-load.ts`):

- Account default in Settings → During a workout (`dumbbellLoadDefault`,
  default **each**), per-exercise override in the session's ⋯ menu
  (`exerciseDumbbellLoads`, keyed by exercise ref key). Both sync in
  `user_preferences`, like the per-exercise kg/lb unit. Picking the default
  clears the override.
- Dumbbell exercises only (catalog `equipment = 'dumbbell'`).
- **A label, never a conversion.** Stored weights, volume, PRs and progression
  use the number as logged, so flipping it is always safe and history stays
  comparable with itself. The weight column header says `KG EACH` / `KG TOTAL`.
- MCP and Ask exercise history carry `weight_is` ("per dumbbell (one hand)" /
  "both dumbbells combined") so Claude reads the numbers right.
