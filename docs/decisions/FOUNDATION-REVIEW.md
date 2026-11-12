# Foundation review: what could limit us later

Status: proposed (2026-11-12). This is a gap pass over [AI-ARCHITECTURE](AI-ARCHITECTURE.md), [AI-PLATFORM](AI-PLATFORM.md) and [AI-CHAT](AI-CHAT.md), looking ahead to food data, health integrations, external services, bigger models and agents.

What AI-PLATFORM already covers is not repeated here: scopes, the lethal-trifecta rule, proposal-only external writes, MCP + OAuth, `SKILL.md`, recipes, cross-device design, and buy vs build.

**How to read it:** each gap has a severity, a recommendation, and *when* to act.
- **Now**: cheap today and costly to retrofit, or it blocks a release.
- **With step N**: do it when the AI work queue step that needs it starts.
- **Trigger**: wait until a stated condition is met.

Principle: **own the domain model and the contracts; buy plumbing; adopt standards over products** (AI-PLATFORM §10b, AI-CHAT §3A).

---

## 1. Findings at a glance

| # | Gap | Severity | When |
|---|---|---|---|
| G1 | No explicit consent before personal data goes to a third-party AI (App Store 5.1.2(i)) | **Release blocker for iOS** | Now |
| G2 | Managed AI endpoints are protected by sign-in + quota only, with no app attestation | High (cost abuse) | With chat Phase 1 |
| G3 | No canonical model for health and food data (units, provenance, dedupe across sources) | High (hard to retrofit) | Before step 5 |
| G4 | Health is Health Connect / HealthKit only; no path for Garmin, WHOOP, Oura cloud data or Strava | Medium | Trigger |
| G5 | Food coverage: Open Food Facts + USDA miss most restaurant and many branded foods; food search can't be fully local | Medium | Step 6 |
| G6 | Open Food Facts is ODbL (share-alike); merging it into our database has licence duties | Medium (legal) | Step 6 |
| G7 | The local database is unencrypted, yet will hold health and nutrition data | Medium | Before step 5 |
| G8 | Model choices are compile-time; there's no remote model catalog or capability registry | Medium | With chat Phase 1 |
| G9 | No user-facing "AI data use" record (what was sent, to whom, when) | Medium (trust) | With chat Phase 1 |
| G10 | External agent consent: one personal token gets every scope; there's no per-client consent screen | Medium | With MCP OAuth |
| G11 | Multimodal inputs (photo, voice, files) have no storage, retention or redaction policy | Low → Medium | Step 6 / chat Phase 5 |

---

## 2. Details and recommendations

### G1. Consent for third-party AI (iOS release blocker)
- **What:** since November 2025, App Review guideline 5.1.2(i) requires apps to **disclose and get permission** before sending personal data to third-party AI. Reviewers have rejected apps that relied on a privacy-policy line alone. Guidance names the provider, uses unchecked defaults, and treats even de-identified user data as covered. On-device and Apple-provided AI are exempt.
- **Our exposure:** narrate, template, plan and chat requests send training data to Groq or OpenRouter (Incline-hosted) or to the user's own key. BYOK counts too: the user chose the provider, but the app still sends the data.
- **Recommend:** an **AI data consent** step the first time any AI feature runs, plus a row in AI settings. It shows:
  - the provider name or names, and that they process data on Incline's behalf;
  - what is sent ("only the workouts, routines and records an answer needs");
  - what is not sent (health data unless allowed separately, account info);
  - toggles that default to off.
  
  The consent is stored with a version and a timestamp. When it's off, AI surfaces show the deterministic fallback. Re-ask when the provider list changes. Android doesn't strictly require this, but use the same flow on both platforms. The consent belongs in `ai_flags` / settings, and the router refuses to run without it.

### G2. Abuse protection for managed AI
- **What:** `ai-task` and the planned `ai-chat` check the Clerk JWT and a per-user quota. A scripted client with a real account can still run up model spend, and free sign-ups multiply quotas.
- **Recommend:**
  - **App attestation**: `@expo/app-integrity` is in SDK 58 and covers Play Integrity and App Attest. Use it the way Firebase App Check is used for AI: a short-lived attestation token on each AI request, verified server-side, and never reused.
  - **Tiered response, not a hard block**: allow → allow with lower limits (unattested, emulator, new account) → deny. Keep a debug and emulator allow-list so our own test devices still work.
  - **Gateway layer**: Cloudflare AI Gateway rate limits and spend caps per account and per model, so one bug can't drain the budget.
  - **Account-age weighting** on quotas, and a global daily spend breaker that flips `ai_flags` automatically.
  - BYOK traffic never touches our proxy, so none of this applies to it.

### G3. Canonical health and food data model (do before Health Connect)
Retrofitting units and provenance after rows exist is the expensive mistake, so this needs deciding first.
- **Every measurement row** is `(metric, value, unit, start, end, tz, source, source_device, external_id, ingested_at, confidence)`.
  - Units are stored in **UCUM** canonical units (kg, kcal, g, bpm, ms). The user's display units are applied at render time, which `src/lib/units.ts` already does for weight.
  - Metric ids follow **Open mHealth** schema names where one exists (body weight, heart rate, step count, sleep episode, physical activity). That way an export or a FHIR bridge later is a mapping.
- **Provenance and dedupe:** the same steps arrive from Health Connect, Garmin and the phone. Keep all rows with their `source`, and pick a winner at read time from a **per-metric source priority** that the user can change. Never delete on import. This is how Apple Health and Health Connect behave themselves.
- **Nutrition:**
  - `food_items` holds the canonical nutrients per 100 g, with nutrient ids aligned to USDA FDC nutrient numbers, plus `source` (`off`, `usda`, `custom`, `vendor:<x>`) and `source_id`.
  - `food_logs` reference an item plus a quantity, and **snapshot the nutrients at log time**, so later database corrections never rewrite history (the same principle as #126).
- **Aggregates for AI:** the AI sees daily or weekly aggregates through tools, never raw samples. This matches AI-PLATFORM §7.7.

### G4. More health sources
- **Health Connect + HealthKit first (already planned).** They cover Samsung, Pixel, Fitbit, Oura (via its app), many watches, and two-way nutrition.
- **Cloud-only sources** (Garmin, WHOOP, Polar, Suunto/COROS, Withings, Dexcom) come later through **one `DataSource` adapter for an aggregator**, not a separate integration each.

  | Option | Notes |
  |---|---|
  | Terra | 500+ sources. About $399–499/month base. Some sources still need our own developer credentials (Garmin, WHOOP, Oura). |
  | Junction (formerly Vital) | Per-user pricing (about $0.50/user/month, unverified). |
  | Spike, ROOK | Alternatives. Spike is noted for Suunto and COROS. |
  | **Open Wearables / Open Health Sync** | Self-hosted, open source (AGPL), with FHIR and Open mHealth output. |

  **Trigger:** about 5% of active users ask for a source that Health Connect / HealthKit doesn't cover. Start with the cheapest per-user option. Because the adapter outputs the G3 model, the vendor can be swapped later.
- **Strava:** its API policy (from June 2026) forbids aggregators re-exposing Strava data. Any Strava support must be a **direct** integration under Strava's own terms, or skipped.
- **Garmin:** commercial access requires an application to Garmin; personal API keys aren't for multi-user apps.

### G5. Food coverage and search
- **Sources:** USDA FDC (CC0, reliable generic foods) + Open Food Facts (barcodes, worldwide, crowd-sourced) at launch. Add **one commercial source** for restaurant foods and wider branded coverage (FatSecret has a free tier with attribution; Nutritionix; Edamam). It goes behind a `FoodSource` adapter, so it's a contract, not a dependency.
- **Search can't be fully local** once the database has millions of rows:
  - **Server:** a food search index. Start with Postgres FTS + `pg_trgm` in Supabase; move to Typesense or Meilisearch when relevance or latency needs it.
  - **Device:** recents, favourites, custom foods and a recently-seen cache in SQLite with FTS5, so logging repeat foods works offline (a gym-loop-style rule for food).
- **Barcode:** `expo-camera` barcode scanning → local cache → `FoodSource` lookup chain (OFF → commercial → "create custom").
- **Photo logging:** a vision-capable model (through `ModelPort`) **names the items and estimates portions only**. Nutrients always come from database matches, and portions are labelled "estimate" and editable. This keeps AI-ARCHITECTURE §1.3's "grounded or silent" rule. Photos stay on the device unless the user opts in (see G11).

### G6. Open Food Facts licence
- OFF data is **ODbL**. Using it requires attribution. If we publish a database derived from it (for example, our merged food catalog exposed through an API or MCP), that derived database must be shared under ODbL too.
- **Recommend:** keep OFF-sourced rows tagged `source = off`. Attribute in the UI ("Data: Open Food Facts"). Don't mix OFF rows into any proprietary catalog we'd license out. Per-user logs that reference foods are fine.

### G7. Encrypting local data
- Health and nutrition data on the device is sensitive, and backups and rooted devices expose plain SQLite.
- **Recommend:** check whether expo-sqlite's SQLCipher option works with our current setup (it needs a native build). The key comes from the secure store (Keystore / Keychain). If the cost is high, at least encrypt the health and nutrition tables' payload columns. Decide **before** health rows exist, because encrypting existing data needs a migration.

### G8. Model catalog and capability registry
- Today, models and capabilities are hard-coded in presets and env.
- **Recommend:** a small remote **model catalog** (synced JSON, like `ai_flags`) with entries of `{id, provider, context window, tools, vision, audio, reasoning, json schema, cost tier, regions, data-retention policy}`. The router picks the cheapest model that meets a task's needs, so a new or larger model is a catalog row plus an eval run, not an app release.
- Track external catalogs (OpenRouter's model list, models.dev) to fill rows, but keep **our** catalog authoritative because it's gated by our evals.
- Data-retention and training policy per provider feed the G1 consent text automatically.

### G9. An "AI data use" record the user can see
- `ai_activity` records changes, not what was sent.
- **Recommend:** each AI call logs locally the provider, the model, which tools' data was included (as categories, not the payload), the token count and the time. This becomes "AI data use" in AI settings, with export and clear.
- It costs little, answers "what did you send?" (G1 and trust), and doubles as observability (AI-CHAT §3A.6).

### G10. Agent access done properly
- Personal tokens are fine for v1. Before third-party agents become common:
  - **OAuth 2.1 through Clerk** (planned), with a **consent screen that lists scopes per client** (`read:history`, `read:health`, `propose:plans`…). The "Connect AI apps" screen lists the connected clients with last use and Revoke.
  - **Per-client rate limits and kill switches** (`actor:mcp:<client>` exists; add per-client quotas).
  - **Health scope is never granted by default**, even if the client asks for everything.
  - **Inbound** (Incline calling the user's MCP servers): tool output is untrusted content, the trifecta rule applies, and there are no auto-applies.
- **Watch:** emerging agent identity work (signed agent identities, verified clients in MCP registries). Adopt when Clerk or the MCP spec ships it, not before.

### G11. Photos, voice and files
- Before photo food logging or voice input:
  - define **retention** (default: processed and discarded; kept only if the user attaches it to a log);
  - define **where it goes** (on-device model first when capable; otherwise the provider named in G1 consent);
  - strip **EXIF/location** before upload;
  - put **storage** for kept media in the same private bucket and signed-URL setup as progress photos.

---

## 3. Bottlenecks to watch (no action yet)

| Bottleneck | Signal | Response |
|---|---|---|
| Custom outbox sync | Conflict bugs or sync work eats sprint time | Evaluate PowerSync (AI-PLATFORM §10b) |
| Supabase Edge 150 s wall clock | Plan/report tasks time out | Queued jobs (Supabase queues → Trigger.dev/Inngest) |
| Single Supabase region | Users far from it see AI latency over 1.5 s to first token | Cloudflare Worker for `ai-chat` passthrough (same contract) |
| Prompt and tool sprawl | More than 15 tools, or many prompt versions | Langfuse for prompts and traces (planned), tool gating (AI-CHAT §3A.5) |
| Eval cost and flakiness | Model swaps blocked on slow evals | Cache eval fixtures; tiered eval (smoke on PR, full nightly) |

## 4. Standards we adopt (summary)
- **OpenAI-compatible chat** for models.
- **MCP** (plus OAuth 2.1, Apps, Tasks) for agents and tools.
- **`SKILL.md`** for skills.
- **JSON Schema** for every tool, action and manifest.
- **UCUM** units and **Open mHealth** metric names for health; **USDA FDC** nutrient numbers for food.
- **OpenTelemetry GenAI** names for AI telemetry, behind our own logger.
- An **AG-UI-shaped** event stream for chat.
- **Health Connect / HealthKit** as the device health hubs.
- A **FHIR** bridge only when a clinical or partner integration needs it.

## 5. Order
1. **Now:** G1 consent. It also unblocks the iOS checkpoint.
2. **Chat Phase 0.5 / 1:** G2 attestation + gateway limits, G8 model catalog, G9 AI data use record.
3. **Before step 5 (Health Connect):** G3 canonical data model and G7 encryption decision.
4. **Step 6 (nutrition):** G5 food sources and search, G6 licence handling, G11 media policy.
5. **With MCP OAuth:** G10.
6. **On trigger:** G4 aggregator and the §3 bottlenecks.

## Sources (checked 2026-11-12)
- 5.1.2(i): [TechCrunch](https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai), [implementation guide](https://stora.sh/blog/2026-05-06-apple-ai-consent-rule-5-1-2-i-implementation-guide), [Apple forums rejection thread](https://developer.apple.com/forums/thread/816140)
- Attestation: [Expo App Integrity (SDK 58)](https://docs.expo.dev/versions/v58.0.0/sdk/app-integrity/), [Firebase AI Logic + App Check pattern](https://firebase.google.com/docs/ai-logic/app-check), [Play Integrity overview](https://developer.android.com/training/safetynet/attestation)
- Wearables: [Terra](https://tryterra.co/), [Strava API alternatives 2026 (Strava aggregator ban)](https://appsforstrava.com/blog/strava-api-alternatives-wearable-data), [Open Wearables](https://openwearables.io/wearable-api), [Open Health Sync](https://github.com/Berndinox/open-health-sync), [build vs buy](https://www.themomentum.ai/blog/the-real-cost-of-wearables-integration-in-2025-build-vs-buy-analysis)
- Food: [Nutritionix API](https://www.nutritionix.com/api), [nutrition DB comparison 2026](https://www.innerbuddies.com/blogs/gut-health/most-accurate-food-nutrition-database), [Open Food Facts API](https://freeapihub.com/apis/open-food-facts-api), [food API list 2026](https://blog.suggestic.com/food-api-ultimate-list)
