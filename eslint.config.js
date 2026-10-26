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
]);
