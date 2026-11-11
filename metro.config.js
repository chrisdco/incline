// Sentry's wrapper = Expo defaults + debug IDs so release stack traces map to source.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

const config = getSentryExpoConfig(__dirname);

// Support .wasm imports used by expo-sqlite on web
config.resolver.assetExts.push('wasm');

// Agent worktrees live in .claude/worktrees, each with its own node_modules.
// Crawling them made Metro's watcher time out ("Failed to start watch mode").
const blocked = /[\\/]\.claude[\\/].*/;
const existing = config.resolver.blockList;
config.resolver.blockList = existing
  ? [...(Array.isArray(existing) ? existing : [existing]), blocked]
  : [blocked];

module.exports = withNativeWind(config, { input: './src/global.css' });
