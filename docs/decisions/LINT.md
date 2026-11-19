# Lint and typecheck toolchain

Decided Nov 2026.

## Lint: oxlint first, ESLint for the rest

`pnpm lint` runs `oxlint && expo lint`. `pnpm lint:fast` runs oxlint alone.

- **oxlint** (`.oxlintrc.json`) runs the bulk of the rules in under a second:
  - core and TypeScript rules mirrored from eslint-config-expo;
  - React, including every React Compiler rule (`react/immutability`, `react/purity`, `react/refs`, …);
  - import rules;
  - the AI import boundaries (`no-restricted-imports` overrides). Later overrides win, so the generic `src/**` ban comes first.
- **ESLint** (`eslint.config.js`) keeps only what oxlint can't run: the design-token `no-restricted-syntax` rules (arbitrary style values, `rounded-lg`, NativeWind style functions). `eslint-plugin-oxlint` (`buildFromOxlintConfigFile`) turns off every rule oxlint already runs, so each finding shows once.
- **Adding a rule:** put it in `.oxlintrc.json` if oxlint has it. Use ESLint only for AST selectors or plugins oxlint lacks. Keep the oxlint and eslint-plugin-oxlint versions equal.
- **Both configs ignore `.claude/**`.** Agent worktrees there are full repo copies; linting them took local ESLint from about 35s to over 200s and caused the bogus `import/no-unresolved` errors.

Revisit when oxlint supports `no-restricted-syntax` or its JS plugins leave alpha. ESLint could then go entirely.

## Typecheck: TypeScript 7

`pnpm typecheck` runs TypeScript 7.0.2 (the native compiler) through the aliased devDependency `typescript-7`. Measured on this repo:

| Checker | Full check | Memory |
|---|---|---|
| tsc 6 | about 34s | 780MB |
| TS 7 | about 2.2s | 576MB |

Both report the same errors.

- **`typescript` stays on `~6.0.3`** because Expo 58, typescript-eslint and editors use its JS API, which TS 7 doesn't ship. `pnpm typecheck:tsc6` runs the old checker if the two ever disagree.
- **Both packages declare a `tsc` bin**, so `node_modules/.bin/tsc` may be either version. Scripts call each by path.
- **Not adopted:**
  - **tsrs** (oxc, Rust port of TS 7): 0.8s, but beta.
  - **tsc-rs:** 1.2s, 0.x.

  Both found the same errors as TS 7. Reconsider tsrs for local use once it has a stable release.
