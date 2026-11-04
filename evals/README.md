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
| `EVAL_STRICT_SCHEMA` | `1` sends the output schema as `json_schema` (constrained decoding where the host supports it) |
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
| `narrate/` | **runnable** | Runs the production prompt (`src/contracts/narrate/prompt.ts`) on 20 FeaturePack fixtures. See the checks below. |
| `probe/` | **runnable** | A capability matrix for the provider and model. It should match the `capabilities` the router declares for that provider. |
| `voice/` | fixtures only (Step 4) | Transcript → `LogSet` / `EditLastSet`. Ambiguous or unsafe input must be declined. |
| `templates/` | fixtures only (Step 2) | Intent → `TemplateDiff`, scored on structural limits: equipment, time, exclusions, muscle coverage, declines. |

The narrate suite checks four things for each fixture:
1. **JSON:** the response parses.
2. **Client gate:** it passes the client's sanitize step, then its validate step.
3. **No invented numbers:** the response contains no number the rules didn't produce.
4. **No drift (#189):** the edge copy of the validator agrees with the client's.

## Results log (2026-11-03)

| Provider / model | Prompt | Output mode | narrate | probes | p50 | Notes |
|---|---|---|---|---|---|---|
| Groq `openai/gpt-oss-20b` @ reasoning low | 1.1.0 | json_object | **20/20** | **8/8** | ~560 ms | **Default for the gateway.** Hit the free tier's 8K tokens-per-minute cap after about 10 calls in a row; retries recovered every one, but a shared key needs caching and per-user quotas. |
| Groq `openai/gpt-oss-20b` @ reasoning low | 1.1.0 | json_schema | 15/20 | — | ~490 ms | Groq checks the schema *after* generating and returns a 400 on any miss, so keep `strictSchema` off for Groq. |
| Groq `openai/gpt-oss-20b` @ default reasoning | 1.0.0 | json_object | 11/20 | — | ~720 ms | About 400 reasoning tokens per call; 8 of the 9 failures were 429s. |
| Ollama `qwen3:4b` Q4 (CPU only) @ reasoning none | 1.0.0 | json_object | 1/20 | — | ~15 s | When the user turn was bare JSON, it echoed the pack back. |
| Ollama `qwen3:4b` Q4 (CPU only) @ reasoning none | 1.1.0 | json_object | 12/20 | — | ~12 s | With an explicit instruction in the user turn, it still echoed the pack 8 times. |
| Ollama `qwen3:4b` Q4 (CPU only) @ reasoning none | 1.1.0 | **json_schema** | **20/20** | — | ~9.8 s | Constrained decoding fixes it. Usable on CPU for background tasks, too slow for interactive ones. With thinking on, a single call took about 40 s. |

**What changed in production because of these runs:**
- **Unsigned numbers are allowed.** The number gate (client and edge) accepts the unsigned value of a negative pack number ("18% lighter" for `-18`).
- **Missing citations count as none.** A response with no `citedInsightIds` is read as an empty list.
- **Prompt narrate-1.1.0.** `buildUserMessage` is shared by the edge function, the app and the evals.
- **Strict JSON schema per provider.** `strictSchema` is set for each provider: on for local and OpenAI, off for Groq.

**Known gap:** numbers written as words ("six weeks") are not checked. Close it when a task's output can carry a number that changes a decision.

## Adding a fixture

When production surprises us (a bad output, a crash, a weird input), add it as a fixture before fixing the prompt. Keep the fixtures realistic. Injection-style and markup-laden names stay in the set permanently.
