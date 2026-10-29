// Sentry's wrapper = Expo defaults + debug IDs so release stack traces map to source.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withUniwindConfig } = require('uniwind/metro');

// `<scheme>-<accent>` themes, generated from src/styles/tokens.ts (`pnpm tokens:css`).
const extraThemes = require('./src/styles/uniwind-themes.json');

const config = getSentryExpoConfig(__dirname);

// Support .wasm imports used by expo-sqlite on web
config.resolver.assetExts.push('wasm');

// Uniwind must be the outermost wrapper (docs.uniwind.dev/quickstart).
module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
  extraThemes,
  // NativeWind's rem was 14px; keep it so every rem-based size is unchanged.
  polyfills: { rem: 14 },
});
