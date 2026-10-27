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
      ],
    },
  },
]);
