# Progression: plateaus, fixes, and who decides (2026-11-17)

Status: adopted. Owner: `src/contracts/coaching/progression.ts`.
Related: [PROGRAMMING.md](PROGRAMMING.md) (the evidence base), [AI-PLATFORM.md](AI-PLATFORM.md) §0 and §7
(proposals and grants).

## The problem

Coaching is opinionated. The app's rules pick one answer, a user's own AI
(Claude over MCP, a BYOK model in Ask) may argue for another, and the user may
simply prefer their way. The goal is to keep all three working smoothly:

- **One stated house rule**, with its evidence grade, the same on every surface.
- **Other opinions are welcome inside safety bounds.** An AI can propose a
  different fix; the user picks. Bounds are about safety, never about taste.
- **The user's choice sticks.** Declining stops the nagging; an applied fix is
  visible everywhere, so no surface re-suggests what was already handled.

## 1. Detection (unchanged rule, now shared)

A lift has **plateaued** when its last 4 sessions in a row failed to beat the
best estimated 1RM before them by at least 0.5% (needs 5 sessions of
history). The lift must have been trained in the last 42 days. This is the
rule the app already used (`detectPlateau`); it now lives in the contract,
so the MCP server, web and Ask run the same code.

## 2. Cause, then fix (deterministic, first match wins)

| # | Cause | Signal | House fix | Grade |
|---|---|---|---|---|
| 1 | **Fatigue, program-wide** | 3+ lifts stalled at once and 4+ straight training weeks | **Deload week**: same exercises, about half the sets, 3+ RIR | C (Bell 2023 consensus); B for reduced over full rest (Coleman 2024) |
| 2 | **Fatigue, this lift** | Top sets at RPE 9+ in 2 of the last 3 sessions | **Reset**: drop the top load about 10%, rebuild with double progression | C |
| 3 | **Too little volume** | The lift's muscle is below the weekly floor for the user's experience | **Add a set** to this lift (within the per-session cap) | A (Pelland 2024 dose-response) |
| 4 | **Long stall** | 8+ sessions without progress | **Swap to a close variation** for a block | C (Kassiano 2022 review: some variation helps, constant change doesn't) |
| 5 | **Stuck at a load** (default) | anything else | **Reset** (as in 2) | C |

Each finding also carries the **other fixes as alternatives**, ranked,
including **change rep range**: for growth, loads from about 30% to 85%+ work
when sets are hard (Schoenfeld 2017, grade A). A range of 8 or more reps at
the top shifts to 5–8, anything lower shifts to 8–12.

Numbers live in `progression.ts` beside their grades. Changing one means
changing it here, too, and bumping `PROGRESSION_RULE_VERSION`.

## 3. What each fix writes

| Fix | Where it lands | Undo |
|---|---|---|
| Reset | A **load override** for this lift's next session only. Afterwards normal double progression continues from what was actually lifted | Revert the decision before the next session |
| Add a set / Change rep range | The user's own **routines** that contain the lift (listed in the preview), through the same snapshot-and-restore path as AI routine edits | Restores the routine snapshots |
| Swap | Replaces the lift in those routines with the chosen substitute (ranked by `rankSubstitutes`; user can pick another) | Restores the snapshots |
| Deload | The existing deload-week flow | Existing |

Every applied fix is a **progression decision** (below) and an
`ai_activity` row, so it shows in the activity log with Undo, whoever
started it.

## 4. Progression decisions (the record every surface reads)

Table `progression_decisions` (device SQLite, synced to Supabase):

| Field | Meaning |
|---|---|
| `exercise_ref` | The lift (catalog / custom ref, same as sync) |
| `remedy` | `reset` / `add_set` / `rep_range` / `swap` / `deload` / `keep_going` |
| `params` | JSON: reset weight, new rep range, substitute ref, … |
| `status` | `proposed` → `applied` / `declined`; `applied` → `done` / `reverted` |
| `source` | `coach` (house rule), `app_ai`, `mcp:<client>`, `web`, `user` |
| `rationale` | Why, in one or two sentences (house sentence, or the AI's reason) |
| `rule_version` | Rule version the finding came from |
| `resume_after_sessions` | For `declined` / `keep_going`: re-check after N more sessions of the lift |

Rules:
- **Applied or proposed** means every surface reports that state instead of
  re-suggesting ("Bench: reset to 90 kg applied 3 days ago").
- **Declined** silences the lift until it is trained `resume_after_sessions`
  more times (default 3), then the plateau check runs fresh.
- **Proposed rows are the inbox.** MCP clients (`propose_progression_change`)
  and the web ("Send to app") insert `proposed` rows; the app shows them as
  proposal cards. Nothing outside the app writes routines.

## 5. When an AI disagrees

An AI proposal names a fix from the same menu, its parameters, and a reason.
`assessProposal()` in the contract sorts it into one of three outcomes:

| Outcome | Example | What the user sees |
|---|---|---|
| **matches** | Claude also says reset to 90 kg | One card, "Your AI agrees with Incline's rule" |
| **differs** (inside safety bounds) | Claude says swap to paused bench | Both side by side: Incline's fix with its grade and source, the AI's fix with its reason. Either applies in one tap |
| **unsafe** | 40% load cut, 12 sets of one lift a session | Not offered as a one-tap apply; the card says which bound it broke. The user can still make any change by hand |

Safety bounds (not opinions), from PROGRAMMING §2:
- a load change between −30% and +10% of the current top set;
- 1–10 sets for the lift per session (`MAX_DIRECT_SETS_PER_SESSION`);
- 1–30 reps, min ≤ max;
- a swap must resolve to a known exercise.

Plain user edits are never checked against the house rule: it's their data.

## 6. Autonomy (like Claude Code's permission modes)

Setting **Coaching changes** (synced account pref `progressionAutonomy`):

| Mode | Like | Behaviour |
|---|---|---|
| **Ask first** (default) | Manual approval | Every fix is a card; nothing changes until Apply |
| **Auto-apply small fixes** | Accept edits | After a workout, the house rule's **low-risk** fixes apply on their own: reset of ≤10%, add 1 set, rep-range shift. A "Changed for you" card says what changed, with Undo. Deload and swap still ask |
| **Off** | Plan only | No fix cards. Stalled lifts still show as information |

AI and MCP proposals **always ask**, in every mode. Per-actor grants (letting
a named AI auto-apply low-risk fixes) are the next step and reuse
`isLowRisk()`; they need the scopes work in AI-PLATFORM §7 first.

## 7. Surfaces (parity)

| Surface | Reads | Writes |
|---|---|---|
| App | Progress "Stalled lifts" with the fix; lift screen (finding, why, evidence, alternatives, history); home insight; session shows the reset load | Apply / decline / undo, autonomy setting, proposal inbox |
| MCP | `get_progression_review` (findings + decisions); plateau status on `get_exercise_history` | `propose_progression_change` (write scope) → inbox |
| Ask | Same read tool via `shapeProgressionReview` | Proposes in chat; the card applies on device |
| Web | Progress "Stalled lifts" with the same findings and decision status | "Send to app" / "Not now" / "Withdraw" (recomputed server-side, never trusted from the form), autonomy in Settings |

## Sources

See PROGRAMMING.md for the volume, load and deload sources. Added here:
- Kassiano W et al. Does varying resistance exercises promote superior muscle
  hypertrophy and strength gains? A systematic review. *J Strength Cond Res*
  2022;36(6):1753–1762.
