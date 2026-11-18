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
