// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // The Next.js web app has its own toolchain (web/eslint.config.mjs).
    ignores: ["dist/*", "web/**/*"],
  },
  {
    // React Compiler lint rules vs. idiomatic library patterns in this app:
    //  - react-hooks/immutability stays on: write Reanimated shared values
    //    with `.set()` / read with `.get()` on the JS thread, not `.value =`.
    //  - react-hooks/set-state-in-effect flags the standard async fetch-on-mount
    //    data hooks (useAsync/useActiveSession/screen loaders), where setState
    //    runs in async callbacks (not synchronously), so the cascading-render
    //    concern the rule targets does not apply. Downgraded to "warn"; adopting
    //    TanStack Query later would remove these entirely.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // AI contracts (docs/decisions/AI-PLATFORM.md D1) are shared with Deno and
    // future hosts: pure TS, relative imports only. scripts/sync-contracts.mjs
    // enforces the same rule when it copies them to supabase/functions/_shared.
    files: ["src/contracts/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: "^[^.]", message: "Contracts are pure TS: import only files inside src/contracts." }] },
      ],
    },
  },
  {
    // AI layers (docs/decisions/AI-CHAT.md §3A.1): own the contracts, rent the
    // libraries. Surfaces use runtime hooks + components only; capabilities
    // never touch UI or a runtime library; only runtime adapters import one.
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: "^(ai|@ai-sdk/.*|@tanstack/ai.*)$", message: "Surfaces never import an AI runtime library; use src/ai/runtime hooks." },
            { group: ["@/ai/runtime/adapters/*", "@/ai/providers/*"], message: "Surfaces never import a model adapter or provider; go through src/ai/runtime or the AI clients." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/ai/capabilities/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: "^(ai|@ai-sdk/.*|@tanstack/ai.*|@/ai/runtime(/.*)?)$", message: "Capabilities are runtime-agnostic: contracts + domain queries only." },
            { regex: "^(@/components/.*|@/app/.*|react-native.*|react)$", message: "Capabilities never import UI." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/ai/runtime/adapters/**", "src/app/**", "src/components/**", "src/ai/capabilities/**", "src/contracts/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: "^(ai|@ai-sdk/.*|@tanstack/ai.*)$", message: "Only src/ai/runtime/adapters imports an AI runtime library." }] },
      ],
    },
  },
  {
    // Design system guard (docs/design/SYSTEM.md): type, radius and spacing
    // come from tokens. Arbitrary values (`text-[13px]`, `p-[7px]`) and the
    // retired `rounded-lg` fail lint; a genuine one-off (micro-marks in a
    // chart) takes an eslint-disable-next-line with a reason.
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/(^|\\s|:)(text|rounded(-[a-z]+)?|p[xytblr]?|m[xytblr]?|gap(-[xy])?|leading|tracking)-\\[/]",
          message: "Arbitrary style value: use a design token (docs/design/SYSTEM.md).",
        },
        {
          selector: "TemplateElement[value.raw=/(^|\\s|:)(text|rounded(-[a-z]+)?|p[xytblr]?|m[xytblr]?|gap(-[xy])?|leading|tracking)-\\[/]",
          message: "Arbitrary style value: use a design token (docs/design/SYSTEM.md).",
        },
        {
          selector: "Literal[value=/(^|\\s)rounded-lg(\\s|$)/]",
          message: "rounded-lg is retired: use rounded-md (inset), rounded-xl (controls), rounded-2xl (tiles) or rounded-3xl (cards).",
        },
        {
          // NativeWind v4 drops a style *function* when className is also set
          // (#291/#292): press feedback and any layout in it never apply.
          selector: "JSXOpeningElement:has(JSXAttribute[name.name='className']) > JSXAttribute[name.name='style'] > JSXExpressionContainer > ArrowFunctionExpression",
          message: "NativeWind drops a style function next to className. Use <Tappable pressedOpacity> (components/ui/tappable) and put layout in className or on a wrapper View.",
        },
      ],
    },
  },
]);
