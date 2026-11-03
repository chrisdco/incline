# AI, integrations and infrastructure resources

This is a reference list for [AI-ARCHITECTURE.md](../decisions/AI-ARCHITECTURE.md). The quotas below were captured on 2026-11-03 and change often. **Check the vendor console before you rely on any number.**

## Providers and runtimes

### Expo AI (`expo-ai`)
https://docs.expo.dev/versions/unversioned/sdk/ai

- **What it is:** on-device AI through Apple Foundation Models (iOS 26+) and Gemini Nano via the ML Kit Prompt API (Android). It also uses the browser Prompt API on web.
- **Status:** alpha. It ships in the next SDK, so the v58 docs return 404.
- **API:** `generateAsync`, `generateStream`, `summarizeAsync`, `categorizeAsync`, `createSessionAsync`, `getAvailabilityAsync`, `prepareAsync`, plus `schema` helpers.
- **Tools:** tool calling with a `beforeTool` approval gate. `maximumToolCalls` defaults to 4 and can go up to 16.
- **Limits:**
  - Android only runs it while the app is in the foreground (`ERR_APP_BACKGROUND`).
  - The schema subset has no unions, null values or patterns.
  - It doesn't trim history. Overflow throws `ERR_CONTEXT_WINDOW_EXCEEDED`.
  - It needs a dev build and won't run in Expo Go.

### OpenRouter
- **Free `:free` models:** 20 requests per minute and 50 per day. **Buying $10 of credits once raises this to 1,000 per day for good.**
- **Fallbacks:** routing falls back across providers automatically, and you can list fallback models.
- **Catch:** free models rotate out of the catalogue. Some free providers log or train on prompts, so check Settings → Privacy.
- **Links:**
  - Limits: https://openrouter.ai/docs/api-reference/limits
  - Free-tier comparison: https://openrouter.ai/blog/tutorials/free-llm-apis-compared/

### Groq
- **Limits:** set per organisation. The authoritative page is https://console.groq.com/settings/limits, and the docs are at https://console.groq.com/docs/rate-limits.
- **Text models:** the published table shows gpt-oss-20b/120b and Qwen 27B at roughly 30 requests per minute, 1,000 per day, 8,000 tokens per minute and 200,000 tokens per day.
- **Speech-to-text:** whisper-large-v3(-turbo) allows 20 requests per minute and 2,000 per day, with about 7,200 audio-seconds per hour and 28,800 per day.
- **Why use it:** very low latency, which suits voice parsing and Ask replies.

### Cloudflare
- **AI Gateway** (https://developers.cloudflare.com/ai-gateway/): caching, rate limiting, analytics, logs and retries/fallback. The core features are free, and a third-party source puts the free plan at about 100,000 logs a month. **Confirm that Groq and OpenRouter are on its provider list** before routing through it.
- **Workers AI pricing** (https://developers.cloudflare.com/workers-ai/platform/pricing/): 10,000 Neurons a day free, shared across all models. Some models need the paid Workers plan since the 2026-07-28 changelog. Use it later for embeddings.
- **R2:** about 10 GB free with no egress fees. Consider it once photos outgrow Supabase Storage.

### Local and desktop (evals)
- **Ollama** (https://ollama.com) and **LM Studio** both expose OpenAI-compatible `/v1` endpoints. The eval runner points at them.

## Speech
- **expo-speech-recognition:** wraps the OS speech recognisers, works with the New Architecture and has an Expo config plugin. Turn on on-device mode where the OS supports it.
- **whisper.rn** (whisper.cpp): fully offline. It needs a prebuild, and the model files are large.
- **react-native-executorch** (Software Mansion): runs Whisper and LLMs on-device, with voice-activity detection. https://docs.swmansion.com/react-native-executorch/

## Health and nutrition
- **Health Connect:**
  - Write data: https://developer.android.com/guide/health-and-fitness/health-connect/develop/write-data
  - The types we need include `ExerciseSessionRecord`, `NutritionRecord`, `WeightRecord`, `StepsRecord`, `SleepSessionRecord`, `HeartRateVariabilityRmssdRecord` and `RestingHeartRateRecord`.
  - Dedupe: write `clientRecordId` and filter what we read by `dataOrigin`.
- **Samsung Health through Health Connect:** https://developer.samsung.com/health/blog/en/accessing-samsung-health-data-through-health-connect
  - Samsung Health nutrition maps to `NutritionRecord` and syncs both ways.
  - The sync has been on since Samsung Health v6.22.5. Users link it under Samsung Health → Settings → Health Connect.
- **react-native-health-connect** (matinzd): an RN binding with an Expo config plugin.
- **Open Food Facts API** (https://openfoodfacts.github.io/openfoodfacts-server/api/): free, with barcode lookup. Its data is under the ODbL licence, so attribution is required.
- **USDA FoodData Central API** (https://fdc.nal.usda.gov/api-guide): free with an API key, and the source of generic food macros.

## UX guidance for AI products
- **Google PAIR, People + AI Guidebook:** https://pair.withgoogle.com/guidebook/ (setting expectations, explaining decisions, failing gracefully).
- **Apple HIG, Generative AI:** https://developer.apple.com/design/human-interface-guidelines/generative-ai
- **Microsoft HAX Toolkit:** https://www.microsoft.com/en-us/haxtoolkit/ (18 guidelines for how people and AI interact).
- **Zomato AI:** a reference for conversational food discovery. It handles intent, cravings, diet and budget, and returns native cards. Zomato also has a voice-ordering pilot and a public MCP server. Coverage:
  - https://inc42.com/buzz/zomato-piloting-ai-powered-voice-bot-for-food-delivery/
  - https://yourstory.com/2023/09/zomato-launches-ai-powered-food-discovery-companion-zomato-ai

## Engineering
- **Anthropic, Building effective agents:** https://www.anthropic.com/engineering/building-effective-agents. Use workflows before agents, and keep loops simple.
- **Vercel AI SDK:** https://ai-sdk.dev, for structured-output and tool-loop patterns. We keep our own thin adapter.
- **promptfoo:** https://www.promptfoo.dev, an option if the vitest eval runner outgrows its job.

## Claude Code skills
- **Existing:**
  - `vercel-react-native-skills` for AI UI surfaces.
  - `claude-api` when a Claude model is wired in.
  - `skill-creator` to write project skills.
- **Planned project skills** (`.claude/skills/`):
  - `incline-ai-task`: scaffolds the schema, prompt, validator, fallback, eval fixtures and registry entry.
  - `incline-ai-surface`: scaffolds an AI entry point on the shared state machine and `src/components/ai/*` parts, following the failure table in AI-ARCHITECTURE §3.
