# Product strategy: how Incline wins (2026-10-27)

Where Incline should beat Hevy / Strong today, and how it stays ahead of
AI-first apps entering the market. Feature work is ranked against this doc.
The pickup list is still [WORK-QUEUE.md](../WORK-QUEUE.md).

## The bet

Logging is a solved, commoditised problem, and AI makes a polished logger
cheap to clone. The moat is **trust and taste**:

- trust, meaning the numbers are right, the advice is explainable, and the
  data is yours and never lost;
- taste, meaning the fastest, calmest between-sets experience on the market.

AI is a multiplier on that foundation, never the foundation itself.

## 1. Beat the incumbents (Hevy, Strong) on their own ground

| Area | Bar to clear | Incline's move |
|---|---|---|
| Between-sets loop | Hevy/Strong: solid, but cluttered and online-leaning | Exercises first, quiet stats, one-thumb edits, rest + next set on lock screen / widget / Live Activity |
| Speed | Spinners on detail screens | SQLite source of truth, cached-first everywhere (§7, §11), no screen waits on network |
| Offline | Mostly online-first | Fully offline; sync is background LWW (§13) |
| Units | One global kg/lb | Per-exercise units, canonical kg storage (§15): mixed-equipment gyms just work |
| Plate math | Separate calculator | Plates inline per exercise, in that exercise's unit |
| Switching cost | Their export formats | One-tap Strong / Hevy CSV import, preserving history, PRs and routines |
| Recaps | Stats dumps | Editorial week/month recaps worth sharing |

## 2. Beat AI-first entrants

New apps will lead with "AI coach writes your program". Their weak points
are what Incline should own:

1. **Numbers from rules, words from AI.** Every load, PR, readiness and
   fatigue call comes from deterministic, tested code (`src/coaching`). AI
   only rewords the feature pack (`buildFeaturePackV1`), so it can't
   invent a weight. Make this visible: "Why this weight?" on every suggestion.
2. **Explainability as UI.** Each suggestion shows its inputs: last
   sets, target range, readiness and the rule that fired. Users and coaches
   can check it.
3. **Works with no network and no AI budget.** The app is complete without
   AI; AI adds language and synthesis. Cost stays bounded, and outages
   are invisible.
4. **Privacy as a feature.** Local-first data; AI gets aggregates, not raw
   history; deletion is complete ([ACCOUNT-DELETION.md](ACCOUNT-DELETION.md)).
5. **Memory that compounds.** Years of structured history (sets, RPE,
   readiness, notes) is the one thing a new entrant can't copy. Every
   feature should make that history more useful: trends, plateaus, "what
   worked last time you came back from a break".

## 3. Go beyond: things nobody does well yet

- **Plateau and deload detection** with a proposed fix ("e1RM flat 4
  weeks → try 3×5 at 90% for 2 weeks"), explained and reversible.
- **Session-aware adaptation.** Bad readiness or a missed set adjusts the
  *rest of today's* session, not just next time.
- **Gym context.** Per-gym equipment and plate inventory (home vs commercial),
  so suggestions and plate math match what's actually there.
- **Conversational logging as an input, not a gimmick:** "same as last time
  but +2.5 on bench" or a voice note becomes structured sets, confirmed before
  saving.
- **Form and progress media** tied to sets (progress photos exist): side-by-side
  over time, private by default.
- **Coach / partner sharing.** Read-only links to a program and its adherence;
  a coach can comment, and nothing is a social feed.
- **Open data.** Clean export, and later an API/Health integrations, so
  users trust they can leave, which makes them stay.

## 4. What to solidify first (order matters)

1. **Correctness and durability.** Sync two-device matrix, units, PRs, no
   lost sets. One bad data-loss story ends a fitness app.
2. **Between-sets experience.** Session screen (#275), lock-screen rest
   timer / Live Activity, widget, haptics, plates inline.
3. **Design system rollout** to every screen ([SYSTEM.md](../design/SYSTEM.md)).
4. **Switching:** Strong / Hevy import.
5. **Explainable coaching UI** ("why this weight") on the existing rules.
6. **AI layer:** narration → weekly recap → plateau/deload proposals →
   conversational logging, each behind the feature pack with cost caps
   and a no-AI fallback.
7. **Release discipline:** alpha/beta channels (§16), Sentry, crash-free rate
   as a gate before each promotion.

## Guardrails

- Never ship an AI-generated number the rules didn't produce.
- No feature may make the offline app worse.
- Every new surface goes through the design system and, for gym-loop
  surfaces, the reference side-by-side.
