# Incline design system

The rules screens follow so hierarchy and spacing stay consistent. Lint
enforces the token part (`eslint.config.js`, `no-restricted-syntax`).

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
| `rounded-2xl` | Tiles inside a card, inline panels |
| `rounded-3xl` | Cards (`<Card>`) and sheets |
| `rounded-full` | Pills, avatars, dots |

`rounded-lg` and arbitrary radii are retired (lint error).

## Surfaces

`bg-background` (screen) → `<Card>` (`bg-surface1`, flat) → `elevation="raised"`
(`bg-surface2`) for the one thing on screen that should lift. Don't hand-build
`rounded-2xl bg-card p-4`: use `<Card>` so aurora skins and borders stay right.

## Components

`src/components/layout`: `Section`, `SectionLabel`, `ListRow` (`stacked`,
`onPress`), `RowIcon`, `StatBlock`. Existing: `Card`, `PressableCard`,
`SectionHeader`, `EmptyState` / `ErrorState`, `Chip`, `SegmentedControl`.

## Gym-loop surfaces

Session rows, cards and pickers still need the side-by-side reference check
(AGENTS.md) before PR. Their anatomy lives in the component header comments.
