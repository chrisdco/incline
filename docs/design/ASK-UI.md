# Ask: shell, idle brief and phases (UI direction)

Status: proposed 2026-11-12. Builds on [AI-CHAT.md](../decisions/AI-CHAT.md) §2
(anatomy) and §8 (phases). This file decides **how Ask looks and what it
leads with**; AI-CHAT stays the source for runtime, tools and storage.

## References and what we take from each

Local screenshots: `C:\Users\admin\Downloads\ai_ui_ideas` (Claude Android,
Zomato AI). Personal data in them, so they're not committed.

| Reference | What it does | Take | Leave |
|---|---|---|---|
| **Claude: idle** | Empty page, the mark, a time greeting ("Afternoon, Chris"), and the composer pinned at the bottom with `+`, mic and voice | Calm, type-led idle; the composer is always at the bottom; one mark, no chrome | A blank page. We have the user's data, so idle should say something useful |
| **Claude: drawer** | ☰ opens a left drawer: sections (Projects, Code, Artifacts), then Recents, View all, and a pinned **New session** button | History lives in a drawer, not on the main page; "New" is always one tap away | Product sections we don't have |
| **Claude: hold to talk** | The composer becomes a waveform with "Release to send" | Voice is part of the composer, not a separate screen (Phase 5) | — |
| **Zomato: Your Feed** | Leads with a **time-aware headline** ("2:55 PM · Late for lunch?"), **one hero card** built from your history with one primary action (swipe to order), then "options you might like", then the composer ("What do you feel like eating?") with a disclaimer | AI that leads with a **decision**, not a blank box; one primary action; the composer phrased in the product's own words | Gradient headlines, photo-heavy cards, loud colour |
| **Zomato: orb** | The AI entry is a dot-matrix orb in the tab bar, and it animates over the page when opened | We already have this: the dot `AiHero` mark and the Android AI button that animates out. Keep it | — |

**Aesthetic: Claude's calm, Zomato's structure.** Our design system is
neutral-first and the accent means progress (SYSTEM.md §4), so Ask uses greys,
type and our `<Hero>` numbers, with the accent only on the one thing that
moved (a PR, a rising e1RM, today's workout). Zomato's lesson is the
*structure* (headline → one hero decision → a few more → composer), not its
colour.

## The shell

**Revised 2026-11-12 (user review of the v2 idle):** idle keeps the mockup's
density and v1's doors. Order: date line → headline ("Push A is next", or
the brief's observation) → **What's next** card (first lifts + Start
workout, which opens the workout screen so session-conflict handling stays
in one place) → **Worth a look** tiles (number, unit, change in colour:
success = progress, warning = needs a look; tap asks about it) → Continue →
**Suggested** doors by entry tab → the **gradient dither card** (the v1
hero, now a reusable `AiHero` door: "Build a plan"). The ambient dither
stays behind the header. This supersedes "no Start workout in Ask" below:
one compact next-workout card is a door, not a second Home.

**Home is for doing; Ask is for understanding.** Home already has the Today
card (next workout + Start), coaching suggestions, PR nudges and the weekly
goal. If Ask's idle opened with "Start workout", that would be a second
Home. So Ask's idle state leads with **what your data raises**, phrased as
questions you can open with one tap. The one action on it is *asking*.

```
┌ ☰   Ask                       ✎ ┐   header: drawer · title · new chat
│            ⠿ (dither mark)       │   the dot mark, small, settles in
│  Bench is up 5 kg this month     │   headline: one observation, by rules
│                                  │
│  ┌ Bench e1RM 92 → 97 kg ↗ ──┐   │   2–3 insight cards: number + question
│  │ What's driving it?        │   │   tap → new thread, card attached
│  └───────────────────────────┘   │
│  ┌ Back 6 sets/wk (aim 10) ──┐   │
│  │ Am I undertraining back?  │   │
│  └───────────────────────────┘   │
│  Continue: "Squat stalled…"  ›   │   last thread, if any
│                                  │
│ ┌ + │ Ask about your training  ↑┐│   composer: floating solid pill
│ └──────────────────────────────┘ │
│  Answers use your logged data.   │
└──────────────────────────────────┘
```

- **Built by rules, from data we already compute** (progress stats, coaching,
  muscle balance, week report), with no model call. It's instant, free, and
  works offline or with AI off. Tapping a card when AI is off opens the
  consent or settings prompt.
- **Headline**: one observation, chosen by priority: a new PR, then a trend
  (a lift up or stalled over 4+ sessions), then a balance gap, then a streak
  or a gap since the last session. It's about training, not the clock: no
  "Good afternoon".
- **Honest thresholds**: each insight needs enough data (for example, 3+
  sessions of a lift). A new user sees what Ask can do plus three starters,
  never thin or invented insights.
- **Cards are questions with their number shown.** The number comes from
  our calc, never the model. Tapping one opens a thread with the card
  attached as context (Phase 2's "Ask about this"; until then it sends the
  question).
- **Continue** resumes the last thread (Claude's Recents, condensed to one row).
- **Drawer (☰)**: **New chat**, Tools (Build a plan, Adjust program,
  Deload check, Reports; ordered by the tab Ask came from), Recents
  (long-press to delete; search and rename later), then *What Incline
  knows* (Phase 3), *AI data use* and *AI settings*. It opens from
  the button; there's no edge swipe, which would fight Android's back
  gesture.
- **In a thread**: the idle content goes, the header shows the thread title
  and the composer stays put. Anatomy as in AI-CHAT §2.2. The keyboard
  opening on idle also hides the cards, so the composer has room.
- **Composer** (`AskComposer`, idle and threads): `+`, the input, send/Stop.
  `+` opens a small menu anchored right above it (ChatGPT/Claude style), not
  a bottom sheet: quick questions that drop into the input, then tools. It
  becomes attach (exercise, workout, routine) in Phase 2.
- **Voice** (decided 2026-11-12): hold-to-talk with on-device recognition
  via `expo-speech-recognition` (iOS SFSpeechRecognizer, Android
  SpeechRecognizer), `requiresOnDeviceRecognition` where the device supports
  it, so audio stays on the phone. It's a native module: adding it changes
  the runtime fingerprint, so it ships with the next native build, not an
  OTA. Needs mic and speech permissions, plus a consent line for devices
  that can only recognise online. No dead mic button before then.
- **Floating, solid** (2026-11-12): the composer is a solid pill
  (`floating`: surface2, shadow) 8 pt above the home indicator, not a bar
  docked to the edge. A frosted pill was tried and rejected: text behind it
  hurt legibility. Content scrolls under it and under the idle header, and
  dissolves there through `EdgeBlur` (`components/ui`): stacked blur bands
  that get stronger toward the edge, plus a page-colour veil held solid
  across the bar that fades only in the tail, so there's no hard cut. The
  top edge only frosts once something has scrolled under it, as the ambient
  slides away and fades out. Android blurs what's inside a `BlurTargetView`
  (expo-blur, SDK 58), using RenderNode on Android 12+ and a plain veil
  below that. `BlurTargetView` reparents its children natively, so no
  Reanimated `entering` animations inside it: their frames went stale when
  data loaded and cards overlapped.
- **Idle hierarchy**: one thing per level. The headline is the largest;
  Start workout is the only primary button; "Worth a look" is numbers;
  "Jump in" is quiet rows (Continue first, then doors, icon and one line
  each); the gradient card closes the page. The next-workout card doesn't
  repeat the name the headline already says. Section labels all use
  `SectionLabel` with the same 32 pt gap.
- **Type** (evaluated 2026-11-12): Geist Sans for everything people read
  or scan, answers included: 16 pt on a 28 pt line, wider paragraph gaps,
  tabular numbers. **Geist Serif** (Vercel, Oct 2026, OFL) is display-only,
  with one Regular weight and no bold, so `**bold**` would be faked and
  its hairlines thin out at 16 pt. In a side-by-side, serif answers read
  softer but numbers and "×" got small and uneven. It suits Ask's display
  moments: the idle headline (`font-serif`, text-4xl) and the gradient card
  title. That gives Ask its own voice next to the rest of the app. Never
  body text. Bundled as `assets/fonts/GeistSerif-Regular.ttf` (from npm
  `geist` 1.9.2, woff2 converted to TTF) with its OFL licence.
- **Thread extras, by rules from tool results** (never the model's text):
  a "✓ Looked at 6 Bench Press sessions" line, an e1RM trend card with a
  sparkline from `get_exercise_history`, and two follow-up chips on the
  last answer. ⋯ in the header deletes the chat.

## The dither mark (Ask's visual signature)

The dot-field mark (`ai-hero-dots.ts`) is what makes Ask ours, the way the
spark is Claude's. Use it as the signature, in AI-owned places only:

| Where | How |
|---|---|
| **Idle header (ambient)** | No box. The brand gradient and the dot halo bleed in from the top edge and fade to the page background over ~40% of the screen, with the mark sitting in it above the headline. The colour and dither set the mood without a card. It replaces the 190 px gradient hero card, which took a third of the screen and said nothing. In a thread it shrinks to a thin band under the header |
| **Opening** | The existing move: the mark eases out of the Android AI button into the header |
| **Thinking** | Before the first token, the mark's dots shimmer: a slow wave of opacity through the grid. That replaces "Thinking…". Tool lines still say what's being read |
| **AI button** | A small version of the mark on the round button (Android) and the tab icon (iOS) |
| **What's new sheet for AI features** | The dot field on the brand gradient as the sheet's art, instead of a photo |

Rules: decorative (hidden from screen readers), static under Reduce Motion,
and never on data cards, charts or numbers. Data stays in the plain chart
language.

### Ambient header, built

`AskAmbient` (`src/components/ai/ask-ambient.tsx`): an absolutely positioned
layer behind the header and idle content.

1. `BrandGradient` at full width, ~40% screen height.
2. The dot field (`HERO_DOTS` halo + mark) on top, in `brand.ink`.
3. A `LinearGradient` from transparent to the page `background` token over
   the bottom 60% of the layer, so both colour and dots dissolve into the
   page. No border, no radius, no shadow.

It's one SVG and two gradients: no per-frame work, so it costs the same as
the old card. Dark mode uses `brandTheme('dark')`, which is already tuned
for low glare.

## Contextual visuals (scenes)

The dither isn't one picture. It's a small, **deterministic generator**: a
scene is `{ kind, seed, density, palette }` and the renderer turns it into
dots. The same inputs always draw the same dots, so it's testable, cheap and
works offline.

| Scene | Driven by | Looks like |
|---|---|---|
| `mark` | Idle with nothing notable | The mark in its halo (today's hero) |
| `rise` | Headline is a PR or a rising lift | Dots denser towards the top-right, an upward drift |
| `steady` | Streak or weekly goal met | Even, calm field; regular rhythm |
| `gap` | Long gap since the last session, or a stall | Sparse field with a gentle gap in the middle |
| `balance` | Muscle-balance gap headline | Two fields with different densities, left and right |
| `fresh` | New user / not enough data | Light scatter, the mark small |

- **Choosing**: the idle headline's rule picks the scene (one mapping
  table, next to the headline rules). Route and progress can override it
  later (for example `rise` after finishing a workout with a PR).
- **Variation**: the seed is `hash(scene + ISO week)`, so the field shifts
  week to week but doesn't jitter between opens. A user never sees "the
  same image" for long, and two users see different ones.
- **Limits**: six scenes at most until one earns a seventh. Scenes are
  mood, never data: the number lives in the headline, not in the dots.

## Model-generated visuals (later; design for it now)

Bigger models will sometimes want to show something more expressive than
text. We let them, **in three tiers, safest first**, and never let the model
ship pixels or code by default. This follows where the standards went:
Google's **A2UI** (declarative JSON that references a client-trusted
component catalog, rendered with native widgets; v0.9, Apr 2026),
**MCP Apps** (a tool returns a `ui://` HTML resource the host renders in a
sandboxed iframe; spec 2026-01-26) and Vercel's **json-render** (the model
writes a JSON spec constrained to a catalog).

| Tier | What the model emits | What we render | When |
|---|---|---|---|
| **T1 catalog cards** | A `data_card` ChatPart: `{ component, props }` from our catalog (records, trend, sets per muscle, workout row) | Our native components; numbers re-read from SQLite by id, never trusted from the model | Phase 2 |
| **T2 parametric scenes** | A `scene` ChatPart: `{ kind, seed, density, palette, caption }` validated against the scene schema | The same dither generator as the idle header | Phase 2–3, behind a flag |
| **T3 sandboxed view** | An MCP Apps-style `ui://` HTML resource | WebView with no network, no JS bridge except a size message; off by default, per-provider opt-in | Only if a real use appears |

- T1 is essentially A2UI with our own catalog. If A2UI reaches 1.0 with a
  maintained React Native renderer, the `data_card` shape should map onto
  its component messages so third-party agents can drive the same cards.
  Until then we don't take the dependency (pre-1.0, only a community RN
  renderer).
- T2 is our edge: an expressive visual from a few validated numbers, drawn
  by our code. No assets to host, no model-drawn images, and the same look
  as the rest of Ask.
- Unknown `component` or `kind` values degrade to text (ChatPart already
  drops unknown part types), so an older app never crashes on a newer
  model's output.

References:
[A2UI](https://developers.googleblog.com/en/introducing-a2ui-an-open-project-for-agent-driven-interfaces/),
[A2UI v0.9](https://www.copilotkit.ai/blog/a2ui-whats-new-in-google-generative-ui-spec),
[A2UI React Native renderer](https://tomevault.io/tome/sivamrudram-eng/a2ui-react-native),
[MCP Apps overview](https://apps.extensions.modelcontextprotocol.io/api/documents/overview.html),
[MCP Apps: when to render UI](https://mcp.directory/blog/mcp-apps-spec-2026-when-should-your-server-render-ui),
[json-render MCP](https://tessl.io/registry/skills/github/vercel-labs/json-render/mcp).

## What's new sheet

Reference: Claude's "New" bottom sheet (art, a "New" tag, title, 2–3 icon
rows, **Try it** / **Later**). It's a presentation of the existing
announcement pack (`src/lib/announcements`), not a new system:

- `Announcement` gains optional `presentation: 'card' | 'sheet'`, `media`
  (`dots` or an image asset), `bullets` (icon + one line, max 3) and `cta`.
- **When**: once per announcement id, at most one per app open, on Home
  after the first frame. Never during an active workout, onboarding or a
  resume prompt.
- **Actions**: one primary (*Try it* deep-links to the feature), one
  secondary (*Later*, which dismisses for good). No third button.
- **Don't**: use it for promos or nags, or stack two in a row. The Home card
  stays for smaller news.
- First use: "Ask about your training", shipped with Phase 1.5.

## Where Ask sits in the navigation

**Keep it as its own button and don't replace a tab.**

- The four tabs are the gym loop: Home, Workouts, Progress, Profile. Ask
  cuts across all of them (it knows which tab you came from, via
  `useAiEntry`), so it belongs beside the bar, not in it. That's the same
  call iOS 26 makes for its search-role tab and Zomato makes with its orb.
- **Swapping Profile for Ask** (Profile moving to an avatar in Home's header)
  is the one swap that would make sense. We'd get a tab-sized target for
  Ask, but Profile is where settings, gyms, measurements and exports live,
  and an avatar hides them. Revisit only if Ask becomes a top-three
  destination by usage. It's a separate decision, so it isn't bundled with
  this.
- **Making Ask the centre button** (a raised middle tab) reads as "create"
  in fitness apps (log a workout), and people would hit it expecting that.
- **Better use of the existing slot**: the button gets the dither mark and
  stays visible while you scroll. During a workout it opens the Phase 4
  sheet over the session, not a new screen.

### Tab labels: keep them

Keep text under the icons. Four destinations is where labels help most:
Material 3's navigation bar shows labels by default, Apple's HIG asks for
a short title on every tab, and icon-only bars test worse for findability
(Progress and Workouts icons aren't self-evident). iOS uses NativeTabs, so
labels there are the system's anyway.

Cleaner, not removed (Android `GlassTabBar`):
- `text-2xs`, **medium weight on and off** (was semibold when active, so
  the label changed width as you switched), one line.
- Active keeps the accent tint: it matches the iOS system tab tint
  (NativeTabs), and selection is the one non-progress use the system
  already makes of it.
- Active icon gets a slightly heavier stroke; no filled/outline swap
  (lucide has no filled set, and mixing sets looks off).
- **Not** selected-only labels: the bar reflows as you switch, and the
  inactive tabs become guesswork.

## Phases (UI view)

| Phase | Status | What the user sees |
|---|---|---|
| 0.5 contracts | ✅ #355 | Nothing (runtime, lint layers) |
| 1 core | ✅ #353–#358 | Consent, AI data use, thread screen with streaming, tool line, source chips, stop; recent chats on Ask |
| **1.5 shell + idle** | ✅ shipped | Ambient dither header with contextual scenes, rules-built idle (headline, insight cards, continue), floating composer, drawer (New chat, Tools, Recents with delete, privacy). Then: thinking shimmer on the working line (static under reduced motion), thread rename (chat menu → sheet), drawer search over titles and message text (local LIKE scan, newest 300 matches), thin brand band at the top of threads, one-time What's new sheet on Home (seen flag = announcement dismiss list, `ask-v1`). Live answers on device still need a signed-in run |
| 2 cards + actions | 🟡 cards in answers | ✅ T1 catalog cards built by rules from what the answer read (`answerCardsFor`): e1RM trend, best estimated 1RM (top 3), sets per muscle per week with a 10-set tick (top 6), recent workouts (tap opens the workout). ✅ "Ask about this": a `context` part on the user turn (kind, name, our id) shown as a chip; the model gets one quoted `[About this …]` line and reads the numbers with its tools (prompt `chat-2`). Entry points: exercise detail, workout summary, idle insight tiles. ✅ Proposal cards from chat: a `propose_routine_change` tool (kind `propose`, never writes) checks the routine is theirs and returns a card; "Review change" opens the routine, whose own Ask builds the exact diff to apply and undo (prompt `chat-3`). ✅ The idle brief draws its headline insight with the same answer card (trend for lifts, sets per muscle for balance). ✅ "Ask" header links on Home (This week) and Progress (Records, Stalled lifts). Left: follow-up chips; `+` attach |
| 3 memory | | "Saved to memory · Undo" chip; *What Incline knows* in the drawer; temporary chat toggle in the header |
| 4 in-session sheet | | Ask as a sheet over the active workout, read-only, timer keeps running |
| 5 later | | Hold-to-talk in the composer; chat sync; on-device model |

**Why 1.5 before 2:** the insight cards and the answer cards are the same
components (a records card, a trend card, a workout card). Building the
shell first gives Phase 2's cards a home on day one, and Ask stops being
an empty box for users who never type.

## Not doing
- A second Home inside Ask: one compact What's next card is the limit
  (no readiness, feed or weekly goal here). Home cards get "Ask about
  this" in Phase 2.
- Model-written headlines. Rules are instant, free, offline and never wrong
  about numbers; a model can rephrase later if it earns its cost.
- Photo or gradient cards. Our cards are numbers and one chart language.
