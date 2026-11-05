# Incline design system

The rules screens follow so hierarchy and spacing stay consistent. Lint
enforces the token part (`eslint.config.js`, `no-restricted-syntax`).

## 2026-11 refresh — direction (v2 — agreed 2026-11-04)

Audit: `docs/design/screens/before/` (emulator, 56-workout sample history).
Main dark theme stays **neutral grey** like iOS / Material / Linear; tinted
skins (aurora etc.) are a separate, later feature.

### Diagnosis — why it feels heavy, dark and basic

The teal isn't too strong; it's **too frequent and too big**. Counted on
the Workouts tab: filled CTA, tinted segment thumb, two outline buttons,
and a tinted full-width "Start Routine" pill on *every* routine card. The
eye has nowhere to land, so nothing reads as important. Same pattern:
tinted profile card, tinted icon circles, solid-teal chart bars.

| Problem | Seen on | What good apps do instead |
|---|---|---|
| Accent on every card | Workouts, Home, Profile | One filled action per screen; repeats are text or icon |
| Every row is a bordered card | Progress history, Exercises, Records | One grouped container, hairline dividers (iOS Settings/Health) |
| Dark layers 5/9/12% L — merge | all dark | Wider steps: base ≈7%, card ≈11%, raised ≈15%, sheet ≈19% |
| Bold/semibold everywhere | titles, rows, numbers | Two weights per row: value bold, everything else regular |
| No headline | Home (promo first), Progress (equal tiles) | One hero number/task at top, rest quieter below |
| Numbers untypeset | `369.0k kg` wraps, axis `39112` | Unit split + muted, compact axis, tabular digits |
| Big radius + border + shadow on all | everywhere | Radius and borders only on containers; rows are flat |

### How the reference apps balance strong colour

- **Apple (HIG):** base vs *elevated* background sets; dimmer base recedes,
  brighter elevated layers advance. Lists are inset *grouped* sections, so
  hundreds of rows read as a few blocks. Colour lives in data (rings, charts)
  and tint text, almost never in big fills.
- **Material 3:** surfaces are neutral tones with a ladder of 5 "surface
  container" roles (lowest → highest) instead of shadows; accent is a role
  (`primary`) applied to small areas, with a softer `primaryContainer` for
  the one tonal button.
- **Linear:** whole theme derived from base + accent + contrast; base is
  near-neutral, hierarchy comes from lightness and weight, not hue. Accent
  shows as a thin indicator, an icon, a focus ring.
- **Revolut / Robinhood:** bright brand colour (violet, lime/green) on a
  neutral ink base, but only on the money number's delta, the one CTA and
  the chart line. The rest is greyscale and whitespace — that's why the
  strong colour feels premium instead of loud.

Rule we take: **60 neutral background / 30 neutral surfaces + text / ≤10
accent**, measured by screen area. Whitespace and grouping do the
separating work that borders and tints do now.

### 1. Tokens (neutral)

Surfaces — neutral zinc (chroma ≈ 0), four steps that are visibly apart:

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#F5F5F7` | `#111113` | screen (≈7% L) |
| `surface-1` | `#FFFFFF` | `#1A1A1D` | grouped lists, cards (≈11%) |
| `surface-2` | `#F0F0F2` | `#232327` | inputs, tiles in cards, raised (≈15%) |
| `surface-3` | `#E6E6EA` | `#2C2C31` | sheets, popovers, pressed (≈19%) |
| `hairline` | `#E4E4E7` | `#2A2A2F` | row dividers inside a group (`bg-hairline`; as a border, `border-divider`) |
| `border` | `#D9D9DE` | `#34343A` | inputs, outline buttons only |

Text — four tiers (contrast on `surface-1`):
`foreground` ≥ 12:1 · `foreground-secondary` ≥ 7:1 · `muted-foreground`
≥ 4.5:1 (units, meta, axis) · `faint` decorative only.

Accent — whichever the user picked (default teal); roles in §4.

Semantic: `success` / `warning` / `destructive` / `info`, each with `-subtle`.
Deltas = coloured text + arrow, no pill.

### 2. Spacing and density

4-pt scale: 4 · 8 · 12 · 16 · 24 · 32.
- Screen inset 16; section gap 24 (32 before the first list after a hero).
- **Comfortable** rows `py-3`; **compact** (history, records, sets) `py-2`,
  44 pt min height, dividers not gaps.
- Group rows in one container; no card-per-row.
- Cards: `rounded-2xl`, no border in dark (fill step does the work), border
  in light only when on `surface-1`-coloured backgrounds.

### 3. Dense-data patterns

1. **Summary first** — one headline (value + delta + period) per screen.
2. **Two numbers per row** — primary metric + one comparison; detail on tap.
3. **Group by time** — history by week, header carries the week's totals.
4. **Typeset numbers** — `tabular-nums`; `<Num>` splits value and unit
   (unit muted, smaller, no wrap); axis `39k`; right-aligned columns.
5. **Icons only where they distinguish** — no identical icon per row.
6. **Filters collapse** — one row of facet buttons (Muscle · Equipment ·
   Pattern); a tapped facet opens its options as one chip row inline
   (`ExerciseFilterBar`, Hevy/Strong pattern).

### 4. Identity without volume (accent-agnostic)

The accent is a user setting (Settings → accent), and the logo is white on
neutral, so identity must not depend on teal or any one hue. Every screen
must read correctly with *any* accent, including in greyscale:
- **Neutral-first.** Structure, hierarchy and brand come from greys,
  type and spacing. The accent is a signal layer on top, never the frame.
- **Accent means progress / current.** PRs, rising e1RM, suggested load,
  the latest bar, the active set, the selected tab — nothing decorative.
- **A signature number style** — `<Hero>`: `text-display` (34), bold not
  black, tabular digits, unit muted via `<Num>` (Apple Fitness/Health style).
- **The incline mark** — the app icon is a serif *i* whose dot is a triangle
  pointing up-right (source: `assets/brand/incline-icon.svg`, foreground-only
  `incline-mark.svg`). In UI it appears as `ArrowUpRight` ↗ (PR badge, trend
  up; `ArrowDownRight` for down), not lucide's zigzag `TrendingUp`.
- **One chart language** — thin line or bars, older data at 45% opacity,
  latest point in accent with its value labelled.

Accent roles, expressed through alpha so they work for every accent:
`bg-primary` (the one filled CTA, label `text-primary-foreground`),
`bg-primary/15` (selected chip/segment, one tonal button), `text-primary-text`
(inline actions, suggestions; `<Icon color="primary">` uses the same tone).
Semantic subtle fills likewise: `bg-success/15`, `bg-warning/15`, …

Contrast (iOS tint / Material tone roles): the fill stays bright, text uses
`primary-text`, a deeper tone in light mode that reaches 4.5:1 on background
and cards. A fill label is white or ink, whichever clears 4.5:1 (most light
accents take ink). `accent-contrast.test.ts` holds every classic accent to it;
plain `text-primary` is the fill colour and is not for text.

### Rollout

PR 1: neutral tokens + primitives (`surface-3`, `hairline`, text tiers,
`Num`, grouped list) and the four bugs (avatar, kg/lb
toggle, summary overlap, thumbnails). PR 2: de-accent and regroup Home,
Workouts, Progress, Profile, Exercises, Summary. Session/set rows: tokens
only, layout untouched until a side-by-side reference check.

## Hierarchy — one job per level

| Level | Use | Component / classes |
|---|---|---|
| Display | Hero numbers (recap totals, timer sheet) | `text-display` / `<Hero>` |
| Screen title | One per screen | `<Heading>` (24 bold) |
| Section title | Large grouping on dashboards | `<Title>` / `<SectionHeader>` |
| Section label | Group label above cards/lists | `<SectionLabel>` (12 semibold uppercase) |
| Row title | List/row primary text | `<ListRow>` title (16 medium) |
| Body | Prose | `<Body>` (16) |
| Meta | Secondary lines, comparisons | `<Caption>` (14 muted) |
| Micro | Table headers, badges, stat labels | `text-2xs` (11/14) |

A screen should read in at most three weights at a glance: the value you
came for, its label, and everything else muted.

## Type scale

`2xs 11` · `xs 12` · `sm 14` · `base 16` · `lg 18` · `xl 20` · `2xl 24` · `3xl 30` · `display 34`.
No arbitrary sizes (`text-[13px]`). Numbers that change in place use `tabular-nums`.

## Spacing (4-pt grid, 8-pt rhythm)

- Screen padding **16** (`SCREEN_PAD`, `px-4`).
- Between sections **24** (`<Section>` → `mt-6`); label → content **8**.
- Inside cards **16** (`p-4`); list rows **12** vertical (`py-3`).
- Related controls **8–12** apart (`gap-2` / `gap-3`); tight pairs **4** (`gap-1`).
- Prefer whole steps; half steps (`1.5`, `2.5`) only for optical alignment.

## Radius

| Token | Use |
|---|---|
| `rounded-sm` | Micro marks (heat cells, spark bars) |
| `rounded-md` | Inset elements inside a control (segmented thumb) |
| `rounded-xl` | Controls: buttons, inputs, chips, icon tiles |
| `rounded-2xl` | Cards (`<Card>`, `<ListGroup>`), tiles, inline panels |
| `rounded-3xl` | Sheets only |
| `rounded-full` | Pills, avatars, dots |

`rounded-lg` and arbitrary radii are retired (lint error).

## Surfaces

`bg-background` (screen) → `<Card>` / `<ListGroup>` (`bg-surface1`) →
`elevation="raised"` / inputs (`bg-surface2` in dark; white in light) → sheets, popovers, pressed
(`bg-surface3`). Dark cards have no border (the fill step separates them);
light cards keep a `hairline`. No shadows on cards. Rows inside a group are
flat, divided by `bg-hairline`. Don't hand-build `rounded-2xl bg-card p-4`:
use `<Card>` so aurora skins and borders stay right.

Text tiers: `text-foreground` → `text-foreground-secondary` →
`text-muted-foreground` → `text-faint` (decorative only).

## Components

`src/components/layout`: `Section`, `SectionLabel`, `ListRow` (`stacked`,
`onPress`), `ListGroup` (rows in one card), `RowIcon`, `StatBlock`, `Num`
(value + muted unit). Existing: `Card`, `PressableCard`,
`SectionHeader`, `EmptyState` / `ErrorState`, `Chip`, `SegmentedControl`.

## AI surfaces (`src/components/ai`)

Three states, same everywhere (AI-ARCHITECTURE §1b):

| State | Visual | Component |
|---|---|---|
| Suggested — nothing changed | dashed `border-primary/50` + spark badge | `ProposalCard`, `SuggestionChip`, `SuggestedBadge` |
| Applied with AI | small muted `AI-assisted` tag; row in AI activity log | `AiAssistedTag` |
| Tracked / imported | source pill (`Health Connect`, `CSV`) | `SourceChip` |

Waiting is `AiThinking` (labelled steps, way out after 6 s); failure is
`AiFallbackNotice` (copy from `src/ai/copy.ts`, always a way on). Writes go
through `applyAiChange` (`src/ai/activity.ts`) so every change is logged and revertible.

## NativeWind rules (lint-enforced where possible)

- **Press feedback:** `<Tappable pressedOpacity>` (`src/components/ui/tappable`),
  never `style={({ pressed }) => …}` next to `className`: NativeWind v4 drops
  the style function, so feedback and any layout in it silently vanish (#291).
- **Layout** goes in `className` or on a wrapper `View`, not inside a press style.
- **expo-image** ignores `rounded-*` and `bg-*`: set `borderRadius` in `style`,
  put placeholder fills on a wrapper `View`.
- **Borders in the divider colour are `border-divider`**, never
  `border-hairline`: NativeWind's own `border-hairline` is a hairline
  *width* on all four sides and beats the colour.
- **No `dark:` variants.** They don't follow the app's theme setting (light
  mode rendered dark fills on device). Branch on `useIsDark()` instead
  (see `Card`, `SegmentedControl`).
- **Third-party components** (bottom sheet, gesture-handler inputs) only take
  `className` if registered with `cssInterop`; otherwise use `style`.

## Gym-loop surfaces

Session rows, cards and pickers still need the side-by-side reference check
(AGENTS.md) before PR. Their anatomy lives in the component header comments.

Session screen (2026-11 pass): set-row geometry is unchanged
(`set-layout.ts`). Around it: one filled action (Finish); duration and rest
are neutral; stats strip ends in a divider, units muted via `Num`; "Add set"
is a solid `surface-2` button, warm-up a text action under it — no dashed
boxes. Accent stays on the suggestion, the next-set tick and supersets.

## Profile and Settings (2026-11 pass)

- **Profile** is identity + stats + one grouped `Training` list (Milestones,
  Exercises, Measurements, Calendar, Calculators) + `Account`. No tile
  grids, no card per link. Stats live in the Progress tab, backup and
  clearing history in Settings.
- **Settings** is a hub: Workout, Units, App (→ Appearance, Notifications,
  AI coaching sub-screens), Display, Backup, Your data, About. A topic gets
  its own screen once it has more than a few rows.
- Destructive rows are plain `ListRow tone="destructive"` inside the group,
  never a tinted card.
- **Tabs clear the session bar:** tab screens use `useTabScreenContent()` /
  `useSessionBarInset()` (`src/hooks/use-tab-content-inset.ts`) so the last
  row is never under the floating workout bar.
- Calculators are one screen with a segment (`/(app)/calculator`,
  `?tab=plates` opens plates).
