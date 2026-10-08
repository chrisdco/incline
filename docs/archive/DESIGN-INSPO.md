# Design inspo — aurora dark skins (ref: two screenshots, Sep 2026)

Reference app ships the same home in two accent skins. What to steal, what to skip.

## What they're doing

- **Near-black tinted base.** Not pure black: teal skin sits on deep navy-teal (~`#0A1118`), pink skin on black-plum (~`#14090F`). Cards slightly lifted (`~#151D29` / `~#1E1016`), fully desaturated — all chroma lives in the accent.
- **One neon accent, used in three places:** (a) icon chips — accent-tinted circle + accent glyph, (b) section eyebrows (`LIBRARY`, `PREVIOUS`) in accent caps, (c) ambient radial glows top-right + center behind the hero. Teal skin ≈ cyan `#35D0E0`; pink skin ≈ `#F06BA8`. Notification badge is a *second* hot color (orange-red) reserved for counts only.
- **Type hierarchy:** big white greeting + hero CTA, gray metadata, accent reserved for labels/icons. Success green appears only in activity deltas.

## What maps to our system already

- Our `ACCENT_THEMES` + `theme-*` classes + `themeHex` are exactly this mechanism (one accent, both schemes). Teal is now the default (`DEFAULT_ACCENT_THEME`).
- Gaps vs ref (future, not now): we have no ambient glow layer, no accent eyebrow convention, no tinted icon-chip component. All three are additive — no token changes needed.

## Proposed special themes (later, when fun themes land)

Distinct, not minimal — safe because base themes remain the fallback:

1. **Aurora** (from teal screenshot): near-black navy-teal base + cyan `#35D0E0` accent + optional radial glow behind home hero. Closest to our teal; the "wow" version of it.
2. **Magma** (from pink screenshot): black-plum base + hot pink `#F06BA8` accent. Our coral is close but redder — Magma goes pinker.
3. **Volt** (new): near-black + lime `#B8E62E` accent. Highest energy, worst taste risk — perfect "fun" candidate.

Each needs: `ACCENT_THEMES` entry (light/dark primary + ring + chart1 + hex), `.theme-*` CSS block, optional base-background tint (keep neutrals shared unless the theme demands its own base — Aurora/Magma do, Volt can reuse default dark).

## Shipped (Sep 2026): rose + electron as full presets, distinct from accents

Proposals 1–2 landed as **`rose`** (hot pink `#F06BA8` dark / `#DB3A7B` light, black-plum base) and **`electron`** (cyan `#3FD4E8` dark / `#0B8A9E` light, navy-teal base). Full skins, not accent swaps: page bg stays near-black/white while **cards carry strong hue fills** (dark plum/navy lifts, light pastel tints) + `themeHex` native-prop base override (keeps the swipe-flash fix exact) + static `HeroGlow` aurora wash on Home, Workouts, Progress (rose/electron only).

## Measured from the reference (Sep 2026, sampled pixels — do not eyeball)

- **Cards:** electron `#0C141F` (`215 44% 8%`, navy — bluer than the cyan accent), rose `#1A0D14` (`328 33% 8%`). Note the card hue differs from the neon hue — depth comes from navy/plum, pop from cyan/pink.
- **Page bg:** near-black with phantom hue — electron `#02050A`, rose `#0B0509`.
- **Neon core:** electron ~`193 90% 60%` (`#3DCDF5`), rose ~`331 85% 68%` (`#F368AB`). Glyph edges run deeper (`196 91% 32%`), glow wash sits at `200 64% 12%` / `329 49% 18%`.
- **Light modes are ours** (user-confirmed): white page, pastel tinted cards. Reference has no light mode — do not invent one from the dark ramps.

Model: skin is derived from accent (`isAuroraAccent`) — no new persisted dimension, no sync change. Settings has a **Theme** preset row (Classic / Electron / Rose) separate from the **Accent** dots (Classic-only; picking one returns to Classic and remembers itself in device-local `lastClassicAccent` for the trip back). Remote Classic accents also refresh the restore point.

## Theme anatomy (a theme = full design language, not an accent)

Per feedback: cards must inherently carry the skin, and dark/light are per-theme shade choices. Rules now encoded:

- Each skin owns its **dark base set** (bg, surfaces, card, muted, border) + **light base** (shared neutrals unless the skin demands otherwise — aurora skins keep light shared) + accent + glow. `Card`/`PressableCard` render **borderless tinted fills** under aurora (`useAuroraSkin`), because hairlines read wireframe on near-black — the ref's cards are borderless lifts.
- Aurora surfaces sit ~2x lifted vs the first pass (card 12–14%, brighter hue-saturated edges) so fills read luminous, never hollow.
- Muted tokens carry the hue in aurora (chips, eyebrows, secondary text) — the propagation mechanism. Classic themes keep muted neutral.

## Rules (distinction without distraction)

- Chroma budget: accent owns CTAs, active states, charts-1, eyebrows, icon chips. Everything else stays neutral.
- Success stays emerald across ALL themes (a PR toast must read the same in Volt as in teal). Destructive stays red. Never let the accent collide with either — reject any candidate within ~30° hue of green/red for the primary slot.
- Glows/gradients live behind content (hero only), never behind inputs or set rows.
- One accent per screen render — charts use accent + fixed supports (`CHART_SUPPORT`), not rainbow series.
