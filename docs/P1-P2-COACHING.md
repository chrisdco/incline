# P1 Closeout and P2 Coaching

This document summarizes the P1 habit-loop closeout and P2 explainable coaching layer shipped in this release.

## P1 — Habit loops (closed)

| Feature | Implementation |
|---------|----------------|
| Dynamic Home context | [`src/lib/home-context.ts`](../src/lib/home-context.ts) ranks promo/context cards (max 2); [`src/components/home/home-context-card.tsx`](../src/components/home/home-context-card.tsx) |
| Weekly consistency goal | `weeklyWorkoutGoal` in settings; [`getWeeklyConsistency`](../src/db/queries/progress.ts); Calendar + Home stat row |
| Announcements v1 | Static pack in [`src/lib/announcements/`](../src/lib/announcements/); dismiss persisted locally |
| Credible suggestions | [`getSuggestedTemplate`](../src/db/queries/templates.ts) uses recent/frequent templates |
| Duration target | Editable `estimatedMinutes` on template editor |
| Measurement export | Dedicated [export screen](../src/app/(app)/export.tsx): pick workouts / custom exercises / bodyweight / circumference + CSV or JSON |
| Motion | Subtle `FadeInDown` on Home context cards |

**Deferred (backlog issues):** measurement goals, full motion system. Photo comparison (#23) shipped locally.

## P2 — Explainable progressive overload (Stage A)

| Layer | Path |
|-------|------|
| Contracts | [`src/coaching/types.ts`](../src/coaching/types.ts) |
| Plate math | [`src/coaching/plates.ts`](../src/coaching/plates.ts) |
| Double progression | [`src/coaching/overload.ts`](../src/coaching/overload.ts) |
| Home insights | [`src/coaching/insights.ts`](../src/coaching/insights.ts) |
| DB read models | [`src/db/queries/coaching/suggestions.ts`](../src/db/queries/coaching/suggestions.ts) |

**Surfaces:** workout preview, active session assist, post-workout summary “Next time”, Home coaching card.

**Schema:** migration `011_set_type` — warm-up vs working; `012_warmup_backfill` tags legacy light prefixes.

## P2 — Guardrails (Stage B)

| Layer | Path |
|-------|------|
| Fatigue | [`src/coaching/fatigue.ts`](../src/coaching/fatigue.ts) — in-session reps/load drop cues |
| Deload | [`src/coaching/deload.ts`](../src/coaching/deload.ts) — 4-week streak → confirm copy at ~60% sets |
| Substitution | [`src/coaching/substitution.ts`](../src/coaching/substitution.ts) — muscle + pattern + equipment rank |
| Insights | [`src/coaching/insights.ts`](../src/coaching/insights.ts) — ranked list; Home still shows one card |

**Surfaces:** session banner + swap, Home deload card → `/(app)/deload`, muscle distribution coaching + least-trained, summary fatigue line.

**Constraint:** suggestions only. `createDeloadTemplate` copies; it never mutates the source routine or program.

## P2 — Hygiene (PR semantics + warm-up backfill)

| Layer | Path |
|-------|------|
| PR rules | [`src/coaching/pr.ts`](../src/coaching/pr.ts) — `heaviest_weight`, `estimated_1rm`, `rep_record`, `volume_record` |
| PR reads | [`src/db/queries/coaching/prs.ts`](../src/db/queries/coaching/prs.ts) |
| Warm-up heuristic | [`src/coaching/warmup-backfill.ts`](../src/coaching/warmup-backfill.ts) + migration `012` |

Celebration surfaces (toast, summary, recap, feed badge, achievements) use heaviest or e1RM and require a strict beat. Progress leaderboard still shows all-time bests per exercise.

## Architecture decisions

### Chosen: ranked Home context slot (not a feed)
- **Why:** Avoids card pile-up; reuses week/month promo patterns; announcements slot in cleanly.
- **Alternative rejected:** Separate “inbox” tab — too much navigation for pre-alpha.

### Chosen: weekly streak + weekly goal (not day streak)
- **Why:** Matches existing `getStreak()` semantics (`Nw` badges); goals align with program thinking.
- **Caveat:** Issue copy mentioning “day streak” was misleading; UI now says `w streak` explicitly.

### Chosen: offline rule engine first, AI later
- **Why:** USP is trustworthy load suggestions without network; rules own numbers.
- **Stack when ready:** Clerk JWT → Supabase Edge Function → structured JSON narrations over `FeaturePackV1` (no model keys in app).

### Chosen: `set_type` column vs heuristic warm-up detection
- **Why:** Explicit tagging is reliable; warm-up button already exists.
- **Follow-up:** Migration `012` applies a conservative prefix heuristic for pre-`set_type` logs (light/incomplete sets before near-peak work). Close ramps and back-off sets stay working.

## P2 deferred (backlog)

- Body-measure ↔ training observational stories (sparse data; from #98)
- AI-1 narration ([#99](https://github.com/ChrisDc777/incline/issues/99)) — **code shipped**; still needs dashboard deploy (SQL + function + secrets). Stub: `COACH_NARRATE_STUB=1` or missing `OPENAI_API_KEY`.
- Program + settings sync extension (milestone follow-up on #57)
- Measurement goals ([#94](https://github.com/ChrisDc777/incline/issues/94)) — keep open; do not build until Measures has regular use
- Photo cloud sync ([#109](https://github.com/ChrisDc777/incline/issues/109)) — local week-vs-week compare shipped ([#23](https://github.com/ChrisDc777/incline/issues/23))
- Native Google account picker ([#112](https://github.com/ChrisDc777/incline/issues/112)) — much later
- Chat coach, program generation, model keys in the app — out of scope

## P2 — Stage C (complete)

| Layer | Path |
|-------|------|
| Schema | migration `016_photo_sync_metadata` — photo metadata + blob queue; `015_program_workouts_updated_at` before that |
| RPE | [`src/coaching/rpe.ts`](../src/coaching/rpe.ts); last-set ≥ 9 holds load |
| Readiness | [`src/coaching/readiness.ts`](../src/coaching/readiness.ts) + kv store; Home check-in; `tired` softens suggestions |
| Program diffs | [`src/coaching/program-plan.ts`](../src/coaching/program-plan.ts); confirm UI [`program-adjust`](../src/app/(app)/program-adjust.tsx) |
| Session UI | RPE chips under completed working sets |
| Settings | `showRpe` (default on; never required) |

**Constraint:** completing a set never waits on RPE/readiness. Intensity uses last-set RPE; tired check-in only softens. Program changes never write until Confirm.

## AI narration (#99) — code shipped, deploy pending

| Layer | Path |
|-------|------|
| Pack contract | [`src/coaching/feature-pack.ts`](../src/coaching/feature-pack.ts) |
| Client | [`src/coaching/narrate-client.ts`](../src/coaching/narrate-client.ts) — opt-in, silent failures, KV cache |
| Edge Function | [`supabase/functions/coach-narrate/`](../supabase/functions/coach-narrate/) + [`supabase/coach-narrate.sql`](../supabase/coach-narrate.sql) |
| Settings | `aiExplanationsEnabled` (default **off**) |

**Constraint:** LLM only rephrases `FeaturePackV1`. Never invents loads. Never called from session finish/complete.

## Progress photo compare (#23)

| Layer | Path |
|-------|------|
| Screen | [`src/app/(app)/progress-photos.tsx`](../src/app/(app)/progress-photos.tsx) |
| UI | [`photo-compare.tsx`](../src/components/progress/photo-compare.tsx), [`photo-picker-sheet.tsx`](../src/components/progress/photo-picker-sheet.tsx) |
| Queries | [`src/db/queries/photos.ts`](../src/db/queries/photos.ts) — join finished sessions |

**Constraint:** local files only until [#109](https://github.com/ChrisDc777/incline/issues/109). No second capture pipeline.

## Verification

```bash
npm run typecheck
npm run test
```

Key tests: [`src/lib/__tests__/home-context.test.ts`](../src/lib/__tests__/home-context.test.ts), [`src/coaching/__tests__/stage-c.test.ts`](../src/coaching/__tests__/stage-c.test.ts), [`src/coaching/__tests__/feature-pack.test.ts`](../src/coaching/__tests__/feature-pack.test.ts), [`src/coaching/__tests__/narrate.test.ts`](../src/coaching/__tests__/narrate.test.ts), [`src/db/__tests__/photos.test.ts`](../src/db/__tests__/photos.test.ts), [`src/coaching/__tests__/pr.test.ts`](../src/coaching/__tests__/pr.test.ts), [`src/coaching/__tests__/warmup-backfill.test.ts`](../src/coaching/__tests__/warmup-backfill.test.ts)
