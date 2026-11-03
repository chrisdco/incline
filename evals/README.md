# Model evals

These check whether a model and prompt are good enough before anything ships ([AI-ARCHITECTURE.md](../docs/decisions/AI-ARCHITECTURE.md)). Swapping a model or changing a prompt only ships if its scores are at least as good as the current ones.

The evals call a real model, or the built-in stub, so `pnpm test` never runs them.

## Run

```bash
# Smoke-test the harness itself (no network)
EVAL_BASE_URL=stub pnpm exec vitest run --config evals/vitest.config.mts

# Local, free (Ollama: `ollama pull qwen3:4b`)
EVAL_BASE_URL=http://localhost:11434/v1 EVAL_MODEL=qwen3:4b pnpm exec vitest run --config evals/vitest.config.mts

# Groq free tier
EVAL_BASE_URL=https://api.groq.com/openai/v1 EVAL_MODEL=openai/gpt-oss-20b EVAL_API_KEY=$GROQ_API_KEY \
  pnpm exec vitest run --config evals/vitest.config.mts

# OpenRouter free model
EVAL_BASE_URL=https://openrouter.ai/api/v1 EVAL_MODEL=<model>:free EVAL_API_KEY=$OPENROUTER_API_KEY \
  pnpm exec vitest run --config evals/vitest.config.mts
```

If `EVAL_BASE_URL` is not set, the suites are skipped. `EVAL_MIN_PASS` sets the pass-rate gate (default `0.9`).

Each run writes a report to `evals/results/` (gitignored) and prints this summary:
- pass rate
- failures by stage
- p50 and p95 latency
- average token counts

## Suites

| Suite | Status | What it scores |
|---|---|---|
| `narrate/` | **runnable** | The production prompt (`supabase/functions/coach-narrate/prompt.ts`) checked against 20 FeaturePack fixtures. See below. |
| `voice/` | fixtures only (Step 4) | Transcript → `LogSet` / `EditLastSet`. Ambiguous or unsafe input must be declined. |
| `templates/` | fixtures only (Step 2) | Intent → `TemplateDiff`, scored on structural limits: equipment, time, exclusions, muscle coverage, declines. |

What the narrate suite checks:
- **JSON:** the response parses.
- **Client gate:** sanitize, then validate.
- **No invented numbers:** the response contains no number the rules didn't produce.
- **#189 drift check:** the edge copy of the validator must agree with the client's.

## Adding a fixture

When production surprises us (a bad output, a crash, a weird input), add it as a fixture before fixing the prompt. Keep the fixtures realistic. Injection-style and markup-laden names stay in the set permanently.
