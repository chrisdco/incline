# Model evals

These check whether a model and prompt are good enough before anything ships ([AI-ARCHITECTURE.md](../docs/decisions/AI-ARCHITECTURE.md)). Swapping a model or changing a prompt only ships if its scores are at least as good as the current ones.

The evals call a real model, or the built-in stub, so `pnpm test` never runs them.

## Setup
Put provider keys in `.env.local` at the repo root. Git ignores this file, and the runner loads it on its own:

```
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
```

## Run

```bash
# Smoke-test the harness (no network)
EVAL_BASE_URL=stub pnpm exec vitest run --config evals/vitest.config.mts narrate

# Presets: ollama (qwen3:4b, reasoning off), groq (gpt-oss-20b, reasoning low), openrouter (needs EVAL_MODEL)
EVAL_PROVIDER=groq pnpm exec vitest run --config evals/vitest.config.mts narrate
EVAL_PROVIDER=ollama EVAL_LIMIT=5 pnpm exec vitest run --config evals/vitest.config.mts narrate
EVAL_PROVIDER=openrouter EVAL_MODEL=<model>:free pnpm exec vitest run --config evals/vitest.config.mts

# Capability probes (JSON, strict schema, tool calls, grounding, injection, long context, determinism)
EVAL_PROVIDER=groq pnpm exec vitest run --config evals/vitest.config.mts probe
```

**Overrides:**

| Variable | What it sets |
|---|---|
| `EVAL_BASE_URL` | The provider endpoint, overriding the preset |
| `EVAL_MODEL` | The model |
| `EVAL_API_KEY` | The API key |
| `EVAL_REASONING_EFFORT` | `none` / `low` / `medium` / `high`. Set it to `""` to leave it out of the request. |
| `EVAL_TIMEOUT_MS` | Per-request timeout. Default 120000. |
| `EVAL_LIMIT` | Run only the first N fixtures |
| `EVAL_MIN_PASS` | The pass rate the suite must reach. Default `0.9`. |

If you don't choose a provider, the suites are skipped. When a provider returns 429, the runner waits as long as the provider asks and retries, up to 5 times.

Each run writes a JSON report to `evals/results/`, which git ignores. The report gives:
- pass rate
- failures by stage
- p50 and p95 latency
- average token counts
- how many 429 retries it needed

## Suites

| Suite | Status | What it covers |
|---|---|---|
| `narrate/` | **runnable** | Runs the production prompt (`supabase/functions/coach-narrate/prompt.ts`) on 20 FeaturePack fixtures. See the checks below. |
| `probe/` | **runnable** | A capability matrix for the provider and model. It should match the `capabilities` the router declares for that provider. |
| `voice/` | fixtures only (Step 4) | Transcript → `LogSet` / `EditLastSet`. Ambiguous or unsafe input must be declined. |
| `templates/` | fixtures only (Step 2) | Intent → `TemplateDiff`, scored on structural limits: equipment, time, exclusions, muscle coverage, declines. |

The narrate suite checks four things for each fixture:
1. **JSON:** the response parses.
2. **Client gate:** it passes the client's sanitize step, then its validate step.
3. **No invented numbers:** the response contains no number the rules didn't produce.
4. **No drift (#189):** the edge copy of the validator agrees with the client's.

## Results log (2026-11-03)

| Provider / model | narrate | probes | p50 | Notes |
|---|---|---|---|---|
| Groq `openai/gpt-oss-20b` @ reasoning low | **20/20** | **8/8** | ~630 ms | It hit the free tier's 8K tokens-per-minute cap after about 10 calls in a row. Retries recovered every one, but a shared key needs caching and per-user quotas. |
| Groq `openai/gpt-oss-20b` @ default reasoning | 11/20 | — | ~720 ms | It produced about 400 reasoning tokens per call, and 8 of the 9 failures were 429s. Keep reasoning at `low`. |
| Ollama `qwen3:4b` (CPU, no GPU) | see below | — | ~2 s | Run with thinking on, each call took about 40 s. `reasoning_effort: none` brought it to about 2 s. |

**Production fixes found by these runs** (both landed in the client and edge validators):
- **Unsigned numbers were rejected.** "18% lighter" restates a pack value of `-18`, but the gate refused it. It now accepts the unsigned value; a positive number still never permits its negative.
- **A missing `citedInsightIds` failed the response.** Models drop the field when there is nothing to cite. It is now read as an empty list.

**Known gap:** numbers written as words ("six weeks") are not checked. Close it when a task's output can carry a number that changes a decision.

## Adding a fixture

When production surprises us (a bad output, a crash, a weird input), add it as a fixture before fixing the prompt. Keep the fixtures realistic. Injection-style and markup-laden names stay in the set permanently.
